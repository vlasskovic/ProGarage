const express = require("express");
const fs = require("fs");
const path = require("path");
const app = express();
const cors = require("cors");


// Omogućava komunikaciju sa frontendom i rad sa JSON formatom podataka.
app.use(cors()); 
app.use(express.json()); 

// Definiše putanje do fajlova za korisnike (users.json), termine (appointments.json) i magacin (inventory.json).
const DB_USERS = path.join(__dirname, "db", "users.json");
const DB_APPOINTMENTS = path.join(__dirname, 'db/appointments.json');
const DB_INVENTORY = path.join(__dirname, 'db/inventory.json');

// Dohvati termine za određeni servis

// Proveri da li postoji db folder, ako ne - napravi ga
if (!fs.existsSync(path.join(__dirname, "db"))) {
  fs.mkdirSync(path.join(__dirname, "db"));
}



// readData i writeData služe za sinhrono čitanje i upisivanje u JSON fajlove (simulacija baze).
const readData = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, "utf8");
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
};

const writeData = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};



// Filtrira i vraća sve zakazane termine za određeni servis.
app.get('/api/appointments/:serviceName', (req, res) => {
    const allAppointments = readData(DB_APPOINTMENTS);
    const filtered = allAppointments.filter(a => a.serviceName === req.params.serviceName);
    res.json(filtered);
});


// Menja status servisa (npr. iz "zakazano" u "u toku").
app.patch('/api/appointments/:id/status', (req, res) => {
    let appointments = readData(DB_APPOINTMENTS);
    const index = appointments.findIndex(a => a.id == req.params.id);
    
    if (index !== -1) {
        appointments[index].status = req.body.status;
        writeData(DB_APPOINTMENTS, appointments);
        res.json({ success: true });
    } else {
        res.status(404).json({ message: "Termin nije pronađen." });
    }
});

// Računa ključne metrike za Dashboard: broj kritičnih delova, broj aktivnih vozila u radionici i ukupan prihod od završenih poslova.
app.get('/api/stats/:serviceName', (req, res) => {
    const inv = readData(DB_INVENTORY).filter(i => i.serviceName === req.params.serviceName);
    const appts = readData(DB_APPOINTMENTS).filter(a => a.serviceName === req.params.serviceName);
    
    // Broj kritičnih delova
    const criticalCount = inv.filter(i => i.quantity <= i.minQuantity).length;
    
    // Aktivni servisi (zakazano + u_toku)
    const activeCount = appts.filter(a => a.status !== 'završeno').length;
    
    // Prihodi (samo završeni servisi)
    const revenue = appts
        .filter(a => a.status === 'završeno')
        .reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0);

    res.json({ criticalCount, activeCount, revenue });
});



// Brzo narucivanje za magacin preko AI-a
app.post('/api/inventory/quick-order', (req, res) => {
    const { serviceName, name, quantity, priceSell } = req.body;
    let inventory = readData(DB_INVENTORY);
    
    // Proveravamo da li deo već postoji u magacinu za taj servis
    const existingItem = inventory.find(i => 
        i.serviceName === serviceName && 
        i.name.toLowerCase() === name.toLowerCase()
    );

    if (existingItem) {
        // Ako postoji, samo dodajemo količinu
        existingItem.quantity += parseInt(quantity);
    } else {
        // Ako ne postoji, pravimo novi unos
        const newItem = {
            id: Date.now(),
            serviceName: serviceName,
            name: name,
            quantity: parseInt(quantity),
            minQuantity: 2, // Defaultni limit
            priceSell: priceSell,   // Vlasnik će naknadno uneti pravu cenu
            createdAt: new Date().toISOString()
        };
        inventory.push(newItem);
    }

    writeData(DB_INVENTORY, inventory);
    res.json({ success: true });
});

// Ažurira stanje (plus/minus). Ako količina padne na 0, artikal se briše iz baze.
app.patch('/api/inventory/:id/stock', (req, res) => {
    try {
        const { change } = req.body;
        let inventory = readData(DB_INVENTORY);
        
        // Pronađi artikal
        const item = inventory.find(i => i.id == req.params.id);

        if (!item) {
            return res.status(404).json({ success: false, message: "Artikal nije pronađen." });
        }

        const newQuantity = item.quantity + parseInt(change);

        if (newQuantity <= 0) {
            // FILTER: Zadrži sve OSIM ovog artikla (čisti niz od null vrednosti)
            const updatedInventory = inventory.filter(i => i.id != req.params.id);
            
            writeData(DB_INVENTORY, updatedInventory);
            
            console.log(`Artikal "${item.name}" je potpuno uklonjen iz baze.`);
            return res.json({ 
                success: true, 
                message: "Artikal trajno uklonjen", 
                removed: true 
            });
        } else {
            // Standardno ažuriranje
            item.quantity = newQuantity;
            writeData(DB_INVENTORY, inventory);
            
            res.json({ 
                success: true, 
                newQuantity: item.quantity,
                removed: false
            });
        }
    } catch (err) {
        console.error("Greška na serveru:", err);
        res.status(500).json({ success: false, message: "Greška na serveru." });
    }
});



// Inicijalizacija GROQ API-a

const Groq = require('groq-sdk');

let GROQ_API_KEY = '';

try {
  const envPath = path.join(__dirname, 'env.json');
  if (fs.existsSync(envPath)) {
    const envData = JSON.parse(fs.readFileSync(envPath, 'utf8'));
    GROQ_API_KEY = envData.GROQ_API_KEY || '';
  }
} catch (error) {
  console.error('Greška pri učitavanju env.json:', error.message);
}

const groq = new Groq({ apiKey: GROQ_API_KEY });


// Koristi Groq (Llama 3) da uporedi zakazane poslove sa trenutnim stanjem i predloži šta tačno treba naručiti.
app.get('/api/inventory/demand-analysis/:serviceName', async (req, res) => {
    try {
        const appointments = readData(DB_APPOINTMENTS);
        const inventory = readData(DB_INVENTORY);
        
        // 1. Filtriramo termine samo za taj servis
        const serviceAppointments = appointments.filter(a => 
            a.serviceName === req.params.serviceName && a.status === 'zakazano'
        );



        if (serviceAppointments.length === 0) {
            return res.json({ message: "Nema zakazanih termina za analizu.", data: [] });
        }

        // 2. Filtriramo inventar samo za taj servis
        const serviceInventory = inventory.filter(i => i.serviceName === req.params.serviceName);

        // Pripremamo podatke za AI
        const inputJobs = serviceAppointments.map(a => `${a.serviceType} za ${a.car}`).join(', ');
        const currentStock = serviceInventory.map(i => `${i.name} (komada: ${i.quantity})`).join(', ');

        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Ti si logistički ekspert za auto-delove. 
                    Tvoj zadatak je da analiziraš poslove i predložiš nabavku samo onoga što NEDOSTAJE u magacinu.
                    
                    INVENTAR KOJI SERVIS VEĆ IMA: [${currentStock}]
                    
                    PRAVILA:
                    1. Ako inventar sadrži 'Set' (npr. Set kvačila, Set kočnica) koji pokriva posao, NE PREDLAŽI pojedinačne delove.
                    2. Ako je deo već na stanju (komada > 0), NE PREDLAŽI ga za nabavku.
                    3. Ako posao zahteva više delova nego što ima na stanju, predloži taj deo.
                    4. Bitno je da analiziras SVE sto je potebno
                    5. Uvek naglasi na koji auto se odnosi
                    6. Sto jednostavnije
                    7. Gledaj da sta god moze da ima vise delova to bude zapravo set
                    8. Predlozi i prodajnu cenu
                    9. Odgovori na Srpskom jeziku
                    10. Pisi ispravne delove iskljucivo za zakazane termine za vozila
                    
                    ODGOVORI ISKLJUČIVO JSON OBJEKTOM:
                    { "delovi": ["Tačan naziv dela 1, Tacna Prodajna Cena", "Tačan naziv dela 2, Tacna Prodajna Cena"] }`
                },
                {
                    role: "user",
                    content: `Na osnovu poslova: [${inputJobs}], šta moram da kupim, a da trenutni inventar to već ne pokriva?`
                }
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" }
        });

        const aiResponse = JSON.parse(completion.choices[0].message.content);
        const suggestedParts = aiResponse.delovi || [];



        // 3. Formiranje finalnog izveštaja za frontend
        const demandReport = suggestedParts.map(partName => {
            // Ponovna provera za svaki slučaj (sigurnosni sloj na backendu)
            const inStock = serviceInventory.find(i => 
                i.name.toLowerCase().includes(partName.toLowerCase()) || 
                partName.toLowerCase().includes(i.name.toLowerCase())
            );

            return {
                partName: partName,
                status: inStock ? (inStock.quantity > 0 ? 'Ima na stanju' : 'NEMA - NARUČI') : 'NEMA - NARUČI',
                currentQty: inStock ? inStock.quantity : 0
            };
        });

        // Filtriramo izveštaj da šaljemo samo ono što stvarno treba naručiti (status NEMA)
        // Jer AI može ponekad pogrešiti, pa mi na backendu još jednom potvrdimo
        const finalReport = demandReport.filter(item => item.status === 'NEMA - NARUČI');

        res.json(finalReport);
    } catch (err) {
        console.error("Greška u radu sa Groq API:", err);
        res.status(500).json({ error: "AI analiza trenutno nije dostupna." });
    }
});


// DODAVANJE NOVOG ARTIKLA U MAGACIN
app.post('/api/inventory', (req, res) => {
    try {
        const inventory = readData(DB_INVENTORY);
        
        const newItem = {
            id: Date.now(), // Jedinstveni ID na osnovu vremena
            serviceName: req.body.serviceName,
            name: req.body.name,
            quantity: parseInt(req.body.quantity) || 0,
            minQuantity: parseInt(req.body.minQuantity) || 0,
            priceSell: parseFloat(req.body.priceSell) || 0,
            createdAt: new Date().toISOString()
        };

        inventory.push(newItem);
        writeData(DB_INVENTORY, inventory);

        console.log(`Dodat novi artikal: ${newItem.name} za servis ${newItem.serviceName}`);
        res.status(201).json({ success: true, item: newItem });
    } catch (err) {
        console.error("Greška pri dodavanju artikla:", err);
        res.status(500).json({ success: false, message: "Greška na serveru." });
    }
});


app.get('/api/inventory/:serviceName', (req, res) => {
    const inv = readData(DB_INVENTORY);
    res.json(inv.filter(i => i.serviceName === req.params.serviceName));
});




// Registruje nove servise ili radnike, proverava duplikate email adresa.
app.post("/api/register", (req, res) => {
  try {
    const users = readData(DB_USERS);

    // Provera da li email već postoji
    if (users.find((u) => u.email === req.body.email)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Korisnik sa ovim emailom već postoji.",
        });
    }

    let newUser = {
      id: Date.now(),
      email: req.body.email,
      password: req.body.password,
      role: req.body.role || "servis", // Ako nije poslato, default je vlasnik
      serviceName: req.body.serviceName, // Za radnika ovo stiže sa frontenda (od vlasnika)
      createdAt: new Date().toISOString(),
      plan: req.body.plan,

    };

    
    if (newUser.role == "servis") {
      newUser = {
        ...newUser,
        freeWorkers: req.body.workerCount,
        workerCount: req.body.workerCount,
        services: req.body.services

      };
    }
    users.push(newUser);
    writeData(DB_USERS, users);

    console.log(`Registrovan novi ${newUser.role}: ${newUser.email}`);
    res.status(201).json({ success: true, message: "Nalog uspešno kreiran!" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Greška na serveru." });
  }
});


// Vraća listu zaposlenih za određeni servis.
app.get("/api/workers/:serviceName", (req, res) => {
  const users = readData(DB_USERS);
  // Filtriramo sve koji su 'radnik' i pripadaju tom servisu
  const workers = users.filter(
    (u) => u.role === "radnik" && u.serviceName === req.params.serviceName,
  );
  res.json(workers);
});

// Ruta za brisanje radnika
app.delete("/api/workers/:id", (req, res) => {
  let users = readData(DB_USERS);
  users = users.filter((u) => u.id != req.params.id);
  writeData(DB_USERS, users);
  res.json({ success: true });
});

// Proverava kredencijale i vraća podatke o korisniku (bez lozinke) radi bezbednosti.
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;
  const users = readData(DB_USERS);

  // Pronađi korisnika sa tim emailom i lozinkom
  const user = users.find((u) => u.email === email && u.password === password);

  if (user) {
    // Ne šaljemo lozinku nazad klijentu iz bezbednosnih razloga
    const { password, ...userWithoutPassword } = user;

    console.log(`Uspešan login: ${email}`);
    res.json({
      success: true,
      user: userWithoutPassword,
    });
  } else {
    res.status(401).json({ success: false, message: "Neispravni podaci." });
  }
});


// Funkcija koja koristi Levenshtein algoritam da prepozna slične reči (npr. "ulje" i "ulju"), što pomaže AI-u da preciznije upari usluge.
function isSimilar(s1, s2) {
    if (!s1 || !s2) return false;
    
    // Čišćenje stringova: mala slova, trimovanje i uklanjanje čestih sufiksa
    const clean = (str) => str.toLowerCase()
        .trim()
        .replace(/e$/, '')   // uklanja 'e' na kraju (ulje -> ulj)
        .replace(/a$/, '')   // uklanja 'a' na kraju (kocnica -> kocnic)
        .replace(/i$/, '')   // uklanja 'i' na kraju (servisi -> servis)
        .replace(/u$/, '');  // uklanja 'u' na kraju (ulju -> ulj)

    const c1 = clean(s1);
    const c2 = clean(s2);

    // 1. Direktno preklapanje korena (npr. "ulj" se sadrži u "ulje")
    if (c1.includes(c2) || c2.includes(c1)) return true;

    // 2. Provera sličnosti vokala (česta greška ilje vs ulje)
    // Zamenjujemo sve vokale istim karakterom da proverimo skelet reči
    const skeleton = (str) => str.replace(/[aeiouy]/g, '*');
    if (skeleton(c1) === skeleton(c2) && c1.length > 2) return true;

    // 3. Levenshtein kao poslednja opcija za duže reči
    const distance = (a, b) => {
        const matrix = [];
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) matrix[i][j] = matrix[i - 1][j - 1];
                else matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
            }
        }
        return matrix[b.length][a.length];
    };

    const dist = distance(c1, c2);
    
    // Za kratke reči (do 4 slova) dozvoljavamo max 1 grešku, za duže 2
    const threshold = c1.length <= 4 ? 1 : 2;
    return dist <= threshold;
}

// Trajno uklanja termin iz baze (storniranje).
app.delete('/api/appointments/:id', (req, res) => {
    try {
        const appointmentId = req.params.id;
        
        // 1. Učitaj sve termine iz fajla
        let appointments = readData(DB_APPOINTMENTS);

        // 2. Proveri da li termin uopšte postoji
        const exists = appointments.some(a => a.id == appointmentId);

        if (!exists) {
            return res.status(404).json({ 
                success: false, 
                message: "Termin nije pronađen u bazi." 
            });
        }

        // 3. Filtriraj niz tako da izbaciš termin sa tim ID-em
        const filteredAppointments = appointments.filter(a => a.id != appointmentId);

        // 4. Snimi nazad u JSON fajl
        writeData(DB_APPOINTMENTS, filteredAppointments);

        console.log(`[DELETE] Termin ID: ${appointmentId} je storniran.`);
        
        res.json({ 
            success: true, 
            message: "Termin je uspešno obrisan." 
        });

    } catch (err) {
        console.error("Greška pri brisanju termina:", err);
        res.status(500).json({ 
            success: false, 
            message: "Greška na serveru prilikom brisanja." 
        });
    }
});


// Prima tekst (npr. poruku klijenta), analizira je pomoću veštačke inteligencije i automatski popunjava formu za zakazivanje, proveravajući slobodne termine kod dostupnih servisa.
app.post('/api/ai/parse-and-find-service', async (req, res) => {
    const { text } = req.body;
    console.log("-> Pametna analiza za:", text);

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: `Analiziraj tekst i vrati ISKLJUČIVO JSON: 
                    {"car": "Model", "serviceType": "Tip usluge", "time": "YYYY-MM-DDTHH:mm", "client": "Ime"}. 
                    Danas je ${new Date().toISOString().split('T')[0]}.`
                },
                { role: "user", content: text }
            ],
            model: "llama-3.3-70b-versatile",
            response_format: { type: "json_object" }
        });

        const aiRes = JSON.parse(completion.choices[0].message.content);
        const searchTag = aiRes.serviceType || "";
        const requestedTime = aiRes.time;

        const users = readData(DB_USERS);
        const appts = readData(DB_APPOINTMENTS);

        // Filtriramo servise koristeći isSimilar funkciju
        const matching = users.filter(u => 
            u.role === 'servis' && 
            Array.isArray(u.services) &&
            u.services.some(s => isSimilar(s.name, searchTag))
        ).map(u => {
            const workerCount = parseInt(u.workerCount) || 1;

            // GLOBALNA PROVERA ZAUZETOSTI (Bilo koji posao u to vreme)
            const busyOverall = appts.filter(a => 
                a.serviceName === u.serviceName && 
                a.time === requestedTime && 
                a.status !== 'otkazano'
            ).length;

            const isFull = busyOverall >= workerCount;

            // Pronalaženje cene pomoću isSimilar
            const foundService = u.services.find(s => isSimilar(s.name, searchTag));
            const price = foundService ? foundService.price : "Na upit";

            // Traženje sledećeg slobodnog dana
            let nextDay = "Sutra";
            if (isFull) {
                let d = new Date(requestedTime || new Date());
                // Tražimo do 7 dana unapred
                for (let i = 1; i <= 7; i++) {
                    d.setDate(d.getDate() + 1);
                    const checkStr = d.toISOString().slice(0, 16);
                    const countAtNewTime = appts.filter(a => 
                        a.serviceName === u.serviceName && a.time === checkStr
                    ).length;

                    if (countAtNewTime < workerCount) {
                        nextDay = d.toLocaleDateString('sr-RS', { day: 'numeric', month: 'short' });
                        break;
                    }
                }
            }

            return {
                serviceName: u.serviceName,
                price: price,
                isFull,
                nextAvailable: nextDay,
                plan: u.plan
            };
        });

        res.json({ aiRecommendation: aiRes, matchingServices: matching });
    } catch (err) {
        console.error("Greška na serveru:", err.message);
        res.status(500).json({ error: "Greška pri obradi podataka." });
    }
});

// Kreira novi termin sa jedinstvenim ID-em generisanim preko Date.now().
app.post('/api/appointments', (req, res) => {
    try {
        const appointments = readData(DB_APPOINTMENTS);
        
        // Validacija osnovnih podataka
        if (!req.body.serviceName || !req.body.car || !req.body.time) {
            return res.status(400).json({ 
                success: false, 
                message: "Nedostaju ključni podaci (Servis, Auto ili Vreme)." 
            });
        }

        const newAppointment = {
            id: Date.now(), // Jedinstveni ID
            serviceName: req.body.serviceName, // Ime servisa kod kojeg se zakazuje
            car: req.body.car,
            serviceType: req.body.serviceType || "Opšti pregled",
            time: req.body.time, // Format: YYYY-MM-DDTHH:mm
            client: req.body.client || "Gost",
            status: req.body.status || "zakazano",
            createdAt: new Date().toISOString()
        };

        appointments.push(newAppointment);
        writeData(DB_APPOINTMENTS, appointments);

        console.log(`Novi termin zakazan: ${newAppointment.car} kod servisa "${newAppointment.serviceName}"`);
        
        res.status(201).json({ 
            success: true, 
            message: "Termin je uspešno sačuvan u bazi.",
            data: newAppointment 
        });
    } catch (err) {
        console.error("Greška pri zakazivanju:", err);
        res.status(500).json({ success: false, message: "Interna greška servera." });
    }
});


app.get('/api/inventory/all-services', (req, res) => {
    const users = readData(DB_USERS);
    const servicesOnly = users.filter(u => u.role === 'servis');
    res.json(servicesOnly);
});

app.listen(3000, () => {
  console.log("Server pokrenut na http://localhost:3000");
  console.log("Putanja do HTML fajlova:", path.join(__dirname, ".."));
});
