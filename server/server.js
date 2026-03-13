// Učitavanje Express biblioteke.
// Express je framework za Node.js koji nam olakšava pravljenje backend servera i API ruta.
// Bez njega bismo morali ručno da obrađujemo zahteve i odgovore preko čistog Node HTTP modula.
const express = require("express");

// Učitavanje fs modula.
// fs = file system.
// Koristi se za čitanje i upis fajlova, pošto u ovom projektu JSON fajlovi glume bazu podataka.
const fs = require("fs");

// Učitavanje path modula.
// path služi da bezbedno i pravilno pravimo putanje do fajlova i foldera.
// Ovo je važno jer različiti operativni sistemi drugačije pišu putanje.
const path = require("path");

// Kreiranje Express aplikacije.
// Promenljiva app predstavlja naš backend server.
// Preko nje kasnije pišemo rute tipa app.get(), app.post(), app.patch(), app.delete().
const app = express();

// Učitavanje CORS biblioteke.
// CORS omogućava da frontend i backend mogu da komuniciraju ako rade na različitim portovima ili adresama.
const cors = require("cors");


// Uključivanje CORS-a.
// Time backend dozvoljava zahtevima sa frontenda da pristupe njegovim API rutama.
app.use(cors()); 

// Uključivanje automatskog parsiranja JSON tela zahteva.
// Kada frontend pošalje JSON, Express ga pretvara u JavaScript objekat i smešta u req.body.
app.use(express.json()); 

// Definisanje putanja do JSON fajlova koji glume bazu podataka.
// users.json čuva korisnike i servise.
// appointments.json čuva termine.
// inventory.json čuva stanje delova u magacinu.
const DB_USERS = path.join(__dirname, "db", "users.json");
const DB_APPOINTMENTS = path.join(__dirname, 'db/appointments.json');
const DB_INVENTORY = path.join(__dirname, 'db/inventory.json');

// Ovaj komentar označava logičku celinu u kodu.
// Ideja je da ispod kreće rad sa terminima za određeni servis.
// Nije funkcionalan deo koda, već samo napomena radi preglednosti.
// Dohvati termine za određeni servis

// Provera da li postoji folder "db".
// Ako ne postoji, backend ga automatski kreira.
// Ovo je korisno jer aplikacija ne sme da padne samo zato što folder još nije napravljen.
if (!fs.existsSync(path.join(__dirname, "db"))) {
  fs.mkdirSync(path.join(__dirname, "db"));
}



// Funkcija za čitanje podataka iz JSON fajla.
// Prima putanju do fajla i pokušava da vrati parsiran sadržaj.
// Ako fajl ne postoji ili je prazan ili neispravan, vraća prazan niz [].
// Ovakav pristup sprečava rušenje servera kada nema podataka.
const readData = (filePath) => {
  try {
    // Ako fajl ne postoji, nema šta da čitamo, pa vraćamo prazan niz.
    if (!fs.existsSync(filePath)) return [];

    // Čitanje sadržaja fajla kao UTF-8 tekst.
    const data = fs.readFileSync(filePath, "utf8");

    // Ako fajl ima sadržaj, pretvaramo JSON tekst u JavaScript objekat/niz.
    // Ako je prazan, vraćamo [].
    return data ? JSON.parse(data) : [];
  } catch (e) {
    // Ako dođe do bilo kakve greške, vraćamo [] umesto da server pukne.
    return [];
  }
};

// Funkcija za upis podataka u JSON fajl.
// Prima putanju i podatke, pa ih upisuje u fajl.
// JSON.stringify(data, null, 2) formatira JSON lepše, sa uvlačenjem od 2 razmaka.
const writeData = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Funkcija za normalizaciju teksta.
// Služi da poređenje stringova bude tolerantnije.
// Na primer:
// - uklanja razmake na početku i kraju
// - pretvara sve u mala slova
// - uklanja dijakritike
// To znači da poređenje naziva usluga postaje pouzdanije.
const normalizeText = (value = "") =>
  value
    .toString()          // Pretvaranje vrednosti u string ako već nije string
    .trim()              // Uklanja višak razmaka sa početka i kraja
    .toLowerCase()       // Pretvara u mala slova radi lakšeg poređenja
    .normalize('NFD')    // Razdvaja slova i dijakritike
    .replace(/[\u0300-\u036f]/g, ''); // Uklanja dijakritike

// Funkcija koja traži cenu usluge za određeni servis.
// serviceName = naziv servisa
// serviceType = tip usluge, npr. "Mali servis"
// Funkcija ide u users.json, nalazi servis, pa u njegovom cenovniku traži odgovarajuću uslugu.
const getServicePrice = (serviceName, serviceType) => {
  const users = readData(DB_USERS);

  // Pronalazi vlasnika servisa po ulozi i nazivu servisa.
  const owner = users.find(
    (u) => u.role === 'servis' && u.serviceName === serviceName
  );

  // Ako servis nije pronađen ili nema niz usluga, nema ni cene.
  if (!owner || !Array.isArray(owner.services)) return 0;

  // Normalizujemo naziv tražene usluge radi tolerantnijeg poređenja.
  const targetService = normalizeText(serviceType);

  // Pokušavamo da pronađemo odgovarajuću uslugu u cenovniku servisa.
  const foundService = owner.services.find((service) => {
    const currentName = normalizeText(service.name);

    // Usluga se smatra pogođenom ako:
    // 1. nazivi potpuno odgovaraju
    // 2. trenutni naziv sadrži traženi naziv
    // 3. traženi naziv sadrži trenutni naziv
    return (
      currentName === targetService ||
      currentName.includes(targetService) ||
      targetService.includes(currentName)
    );
  });

  // Ako je usluga pronađena, vraća njenu cenu kao broj.
  // Ako nije, vraća 0.
  return parseFloat(foundService?.price) || 0;
};

// Funkcija koja obezbeđuje da termin ima cenu.
// Ako termin već ima validnu cenu, koristi tu cenu.
// Ako nema, pokušava da je izračuna iz cenovnika servisa preko getServicePrice().
const ensureAppointmentPrice = (appointment) => {
  const currentPrice = parseFloat(appointment?.price);

  // Ako cena postoji i veća je od nule, koristimo nju.
  if (!Number.isNaN(currentPrice) && currentPrice > 0) {
    return currentPrice;
  }

  // Ako cena ne postoji, uzimamo je iz cenovnika servisa.
  return getServicePrice(appointment?.serviceName, appointment?.serviceType);
};


// GET ruta za vraćanje svih termina jednog servisa.
// :serviceName je parametar iz URL-a.
// Primer poziva: /api/appointments/Auto%20Centar%20Pro
app.get('/api/appointments/:serviceName', (req, res) => {
    // Učitavanje svih termina iz "baze"
    const allAppointments = readData(DB_APPOINTMENTS);

    // Filtriranje termina tako da ostanu samo oni koji pripadaju prosleđenom servisu.
    // Uz svaki termin još osiguravamo da ima cenu.
    const filtered = allAppointments
        .filter(a => a.serviceName === req.params.serviceName)
        .map(a => ({
            ...a,
            price: ensureAppointmentPrice(a)
        }));

    // Slanje rezultata frontend-u kao JSON.
    res.json(filtered);
});


// PATCH ruta za izmenu statusa termina.
// Koristi se kada se status menja, npr. iz "zakazano" u "u_toku" ili "završeno".
app.patch('/api/appointments/:id/status', (req, res) => {
    // Učitavanje svih termina
    let appointments = readData(DB_APPOINTMENTS);

    // Traženje termina po ID-u
    const index = appointments.findIndex(a => a.id == req.params.id);
    
    // Ako je termin pronađen
    if (index !== -1) {
        // Menjamo status na onaj koji je stigao iz frontenda
        appointments[index].status = req.body.status;

        // Ako status postane "završeno", tada backend:
        // 1. osigurava cenu termina
        // 2. beleži vreme završetka
        if (req.body.status === 'završeno') {
            appointments[index].price = ensureAppointmentPrice(appointments[index]);
            appointments[index].completedAt = new Date().toISOString();
        }

        // Čuvanje izmenjenog niza termina nazad u fajl
        writeData(DB_APPOINTMENTS, appointments);

        // Vraćamo odgovor frontend-u
        res.json({
            success: true,
            data: appointments[index],

            // Ako je posao sada završen, ovde vraćamo koliki je prihod dodat.
            // To frontend može da koristi za osvežavanje dashboard statistike.
            revenueAdded: req.body.status === 'završeno' ? (parseFloat(appointments[index].price) || 0) : 0
        });
    } else {
        // Ako termin ne postoji, vraćamo 404.
        res.status(404).json({ message: "Termin nije pronađen." });
    }
});

// GET ruta za dashboard statistiku servisa.
// Vraća:
// - broj kritičnih delova
// - broj aktivnih termina
// - ukupan prihod od završenih poslova
app.get('/api/stats/:serviceName', (req, res) => {
    // Uzimamo inventar samo za konkretan servis
    const inv = readData(DB_INVENTORY).filter(i => i.serviceName === req.params.serviceName);

    // Uzimamo termine samo za konkretan servis
    const appts = readData(DB_APPOINTMENTS).filter(a => a.serviceName === req.params.serviceName);
    
    // Kritični delovi su oni čija je količina manja ili jednaka minimalnoj količini.
    const criticalCount = inv.filter(i => i.quantity <= i.minQuantity).length;
    
    // Aktivni servisi su svi termini koji još nisu završeni.
    // Ovde ulaze "zakazano" i "u_toku".
    const activeCount = appts.filter(a => a.status !== 'završeno').length;
    
    // Prihod se računa samo iz završenih termina.
    // reduce sabira sve pojedinačne cene u jedan ukupan zbir.
    const revenue = appts
        .filter(a => a.status === 'završeno')
        .reduce((sum, a) => sum + ensureAppointmentPrice(a), 0);

    // Frontendu šaljemo objedinjene metrike za dashboard.
    res.json({ criticalCount, activeCount, revenue });
});



// POST ruta za brzo naručivanje delova iz AI preporuke.
// Ova ruta služi da korisnik jednim klikom doda preporučeni artikal u magacin.
app.post('/api/inventory/quick-order', (req, res) => {
    // Destrukturiranje podataka iz tela zahteva
    const { serviceName, name, quantity, priceSell } = req.body;

    // Učitavanje inventara
    let inventory = readData(DB_INVENTORY);
    
    // Provera da li artikal već postoji za taj servis.
    // Poređenje naziva radimo case-insensitive.
    const existingItem = inventory.find(i => 
        i.serviceName === serviceName && 
        i.name.toLowerCase() === name.toLowerCase()
    );

    if (existingItem) {
        // Ako artikal već postoji, samo povećavamo količinu.
        existingItem.quantity += parseInt(quantity);
    } else {
        // Ako artikal ne postoji, pravimo novi zapis u inventaru.
        const newItem = {
            id: Date.now(),                // Jedinstveni ID zasnovan na trenutnom vremenu
            serviceName: serviceName,      // Kom servisu pripada artikal
            name: name,                    // Naziv dela
            quantity: parseInt(quantity),  // Početna količina
            minQuantity: 2,                // Podrazumevani minimalni limit
            priceSell: priceSell,          // Prodajna cena
            createdAt: new Date().toISOString() // Vreme kreiranja
        };

        // Dodavanje novog artikla u inventar
        inventory.push(newItem);
    }

    // Čuvanje inventara nazad u fajl
    writeData(DB_INVENTORY, inventory);

    // Potvrda uspešnog izvršavanja
    res.json({ success: true });
});

// PATCH ruta za promenu količine artikla.
// change može biti +1 ili -1, ali i bilo koji drugi broj.
// Ako količina padne na 0 ili manje, artikal se briše.
app.patch('/api/inventory/:id/stock', (req, res) => {
    try {
        // change stiže iz req.body
        const { change } = req.body;

        // Učitavanje svih artikala
        let inventory = readData(DB_INVENTORY);
        
        // Traženje artikla po ID-u
        const item = inventory.find(i => i.id == req.params.id);

        // Ako artikal nije pronađen, vraćamo 404
        if (!item) {
            return res.status(404).json({ success: false, message: "Artikal nije pronađen." });
        }

        // Računamo novu količinu
        const newQuantity = item.quantity + parseInt(change);

        if (newQuantity <= 0) {
            // Ako nova količina padne na 0 ili manje, brišemo artikal iz niza.
            const updatedInventory = inventory.filter(i => i.id != req.params.id);
            
            // Upisujemo nov niz bez tog artikla
            writeData(DB_INVENTORY, updatedInventory);
            
            // Log u konzoli radi praćenja rada servera
            console.log(`Artikal "${item.name}" je potpuno uklonjen iz baze.`);

            // Frontendu šaljemo informaciju da je artikal uklonjen
            return res.json({ 
                success: true, 
                message: "Artikal trajno uklonjen", 
                removed: true 
            });
        } else {
            // Ako količina ostaje pozitivna, samo ažuriramo stanje
            item.quantity = newQuantity;
            writeData(DB_INVENTORY, inventory);
            
            // Vraćamo novu količinu i informaciju da nije obrisan
            res.json({ 
                success: true, 
                newQuantity: item.quantity,
                removed: false
            });
        }
    } catch (err) {
        // Ako se dogodi interna greška, ispisujemo je i vraćamo 500.
        console.error("Greška na serveru:", err);
        res.status(500).json({ success: false, message: "Greška na serveru." });
    }
});



// Učitavanje Groq biblioteke za AI funkcionalnosti.
const Groq = require('groq-sdk');

// Kreiranje Groq klijenta.
// Ovde bi u pravoj aplikaciji trebalo čuvati API ključ
const groq = new Groq({ apiKey: "OVDE_JE_POTREBNO_UNETI_API_KLJUC"});


// GET ruta za AI analizu potražnje delova.
// Ideja je da se pogledaju zakazani poslovi i trenutno stanje magacina,
// pa da AI predloži koje delove treba nabaviti.
app.get('/api/inventory/demand-analysis/:serviceName', async (req, res) => {
    try {
        // Učitavanje termina i inventara
        const appointments = readData(DB_APPOINTMENTS);
        const inventory = readData(DB_INVENTORY);
        
        // Uzimamo samo zakazane termine za dati servis.
        // Ovde nam nisu bitni završeni termini, nego budući poslovi.
        const serviceAppointments = appointments.filter(a => 
            a.serviceName === req.params.serviceName && a.status === 'zakazano'
        );

        // Ako nema zakazanih termina, nema potrebe za analizom.
        if (serviceAppointments.length === 0) {
            return res.json({ message: "Nema zakazanih termina za analizu.", data: [] });
        }

        // Filtriramo inventar samo za servis koji se trenutno analizira.
        const serviceInventory = inventory.filter(i => i.serviceName === req.params.serviceName);

        // Spremamo opis poslova za AI.
        // Primer: "Mali servis za Golf 7, Zamena kočnica za Audi A4"
        const inputJobs = serviceAppointments.map(a => `${a.serviceType} za ${a.car}`).join(', ');

        // Spremamo trenutno stanje delova za AI.
        // Primer: "Ulje 5W30 (komada: 3), Filter ulja (komada: 1)"
        const currentStock = serviceInventory.map(i => `${i.name} (komada: ${i.quantity})`).join(', ');

        // Poziv AI modela.
        // Koristimo system poruku da precizno objasnimo modelu kako treba da razmišlja i kako da vrati odgovor.
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

        // Parsiranje AI odgovora iz JSON stringa u JavaScript objekat
        const aiResponse = JSON.parse(completion.choices[0].message.content);

        // Uzima niz delova iz AI odgovora.
        // Ako AI ne vrati delove, koristimo prazan niz.
        const suggestedParts = aiResponse.delovi || [];

        // Ovde pravimo finalan izveštaj za frontend.
        // Za svaki predlog još jednom proveravamo da li deo zaista postoji u magacinu.
        const demandReport = suggestedParts.map(partName => {
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

        // Dodatni sigurnosni filter.
        // Backend šalje samo delove koji stvarno fale.
        // Ovo je važno jer AI može da pogreši, pa backend služi kao dodatna kontrola.
        const finalReport = demandReport.filter(item => item.status === 'NEMA - NARUČI');

        // Slanje finalnog izveštaja frontend-u
        res.json(finalReport);
    } catch (err) {
        // Ako dođe do greške pri AI analizi, vraćamo 500.
        console.error("Greška u radu sa Groq API:", err);
        res.status(500).json({ error: "AI analiza trenutno nije dostupna." });
    }
});


// POST ruta za ručno dodavanje novog artikla u magacin.
app.post('/api/inventory', (req, res) => {
    try {
        // Učitavanje postojećeg inventara
        const inventory = readData(DB_INVENTORY);
        
        // Formiranje novog artikla
        const newItem = {
            id: Date.now(), // Jedinstveni ID zasnovan na trenutnom vremenu
            serviceName: req.body.serviceName,
            name: req.body.name,
            quantity: parseInt(req.body.quantity) || 0,
            minQuantity: parseInt(req.body.minQuantity) || 0,
            priceSell: parseFloat(req.body.priceSell) || 0,
            createdAt: new Date().toISOString()
        };

        // Dodavanje artikla u inventar
        inventory.push(newItem);

        // Snimanje inventara nazad u JSON fajl
        writeData(DB_INVENTORY, inventory);

        // Log za backend praćenje
        console.log(`Dodat novi artikal: ${newItem.name} za servis ${newItem.serviceName}`);

        // Vraćamo 201 Created jer je kreiran novi resurs
        res.status(201).json({ success: true, item: newItem });
    } catch (err) {
        // Obrada serverske greške
        console.error("Greška pri dodavanju artikla:", err);
        res.status(500).json({ success: false, message: "Greška na serveru." });
    }
});

// GET ruta koja vraća sve artikle magacina za jedan servis.
app.get('/api/inventory/:serviceName', (req, res) => {
    const inv = readData(DB_INVENTORY);

    // Filtriranje samo artikala za traženi servis
    res.json(inv.filter(i => i.serviceName === req.params.serviceName));
});




// POST ruta za registraciju.
// Koristi se i za vlasnika servisa i za radnika.
app.post("/api/register", (req, res) => {
  try {
    // Učitavamo sve postojeće korisnike
    const users = readData(DB_USERS);

    // Proveravamo da li email već postoji.
    // Time sprečavamo duplikate i probleme pri logovanju.
    if (users.find((u) => u.email === req.body.email)) {
      return res
        .status(400)
        .json({
          success: false,
          message: "Korisnik sa ovim emailom već postoji.",
        });
    }

    // Osnovna struktura novog korisnika.
    let newUser = {
      id: Date.now(),                 // Jedinstveni ID
      email: req.body.email,          // Email korisnika
      password: req.body.password,    // Lozinka
      role: req.body.role || "servis",// Ako nije prosleđena, podrazumeva se da je vlasnik servisa
      serviceName: req.body.serviceName, // Naziv servisa kojem pripada korisnik
      createdAt: new Date().toISOString(), // Datum kreiranja naloga
      plan: req.body.plan,            // Plan pretplate
    };

    // Ako je korisnik servis, dodaju se dodatna polja specifična za servis.
    if (newUser.role == "servis") {
      newUser = {
        ...newUser,
        freeWorkers: req.body.workerCount, // Broj slobodnih mesta za radnike
        workerCount: req.body.workerCount, // Ukupan broj radnika prema planu
        services: req.body.services        // Cenovnik/usluge koje servis nudi
      };
    }

    // Dodavanje korisnika u niz
    users.push(newUser);

    // Čuvanje korisnika u fajl
    writeData(DB_USERS, users);

    // Log u konzoli
    console.log(`Registrovan novi ${newUser.role}: ${newUser.email}`);

    // Potvrda uspešne registracije
    res.status(201).json({ success: true, message: "Nalog uspešno kreiran!" });
  } catch (err) {
    // Serverska greška
    res.status(500).json({ success: false, message: "Greška na serveru." });
  }
});


// GET ruta koja vraća sve radnike za određeni servis.
app.get("/api/workers/:serviceName", (req, res) => {
  const users = readData(DB_USERS);

  // Filtriramo samo korisnike sa rolom "radnik" koji pripadaju traženom servisu.
  const workers = users.filter(
    (u) => u.role === "radnik" && u.serviceName === req.params.serviceName,
  );

  // Slanje liste radnika
  res.json(workers);
});

// DELETE ruta za brisanje radnika po ID-u.
app.delete("/api/workers/:id", (req, res) => {
  let users = readData(DB_USERS);

  // Izbacujemo korisnika sa datim ID-em iz niza
  users = users.filter((u) => u.id != req.params.id);

  // Čuvamo izmenjen niz korisnika
  writeData(DB_USERS, users);

  // Vraćamo potvrdu uspeha
  res.json({ success: true });
});

// POST ruta za login.
// Proverava da li postoji korisnik sa tim emailom i lozinkom.
app.post("/api/login", (req, res) => {
  const { email, password } = req.body;

  // Učitavanje svih korisnika
  const users = readData(DB_USERS);

  // Traženje korisnika sa poklapanjem email + password.
  const user = users.find((u) => u.email === email && u.password === password);

  if (user) {
    // Iz bezbednosnih razloga ne vraćamo lozinku frontend-u.
    const { password, ...userWithoutPassword } = user;

    console.log(`Uspešan login: ${email}`);

    res.json({
      success: true,
      user: userWithoutPassword,
    });
  } else {
    // Ako ne postoji korisnik sa tim podacima, vraća se 401 Unauthorized.
    res.status(401).json({ success: false, message: "Neispravni podaci." });
  }
});


// Funkcija za proveru sličnosti dve reči.
// Koristi više nivoa poređenja da bi AI deo sistema mogao pametnije da prepozna usluge,
// čak i kada korisnik ili AI vrati malo drugačiji naziv.
function isSimilar(s1, s2) {
    // Ako neki string ne postoji, nema sličnosti.
    if (!s1 || !s2) return false;
    
    // Funkcija clean sređuje reči:
    // - pretvara u mala slova
    // - uklanja razmake
    // - uklanja česte završetke
    const clean = (str) => str.toLowerCase()
        .trim()
        .replace(/e$/, '')   // npr. ulje -> ulj
        .replace(/a$/, '')   // npr. kocnica -> kocnic
        .replace(/i$/, '')   // npr. servisi -> servis
        .replace(/u$/, '');  // npr. ulju -> ulj

    const c1 = clean(s1);
    const c2 = clean(s2);

    // 1. Direktno preklapanje.
    // Ako jedna reč sadrži drugu, smatramo ih sličnim.
    if (c1.includes(c2) || c2.includes(c1)) return true;

    // 2. Skelet reči.
    // Sve vokale menjamo istim simbolom i proveravamo da li je "oblik" reči isti.
    const skeleton = (str) => str.replace(/[aeiouy]/g, '*');
    if (skeleton(c1) === skeleton(c2) && c1.length > 2) return true;

    // 3. Levenshtein distanca.
    // Ovaj algoritam meri koliko je izmena potrebno da bi se jedna reč pretvorila u drugu.
    const distance = (a, b) => {
        const matrix = [];

        // Inicijalizacija matrice
        for (let i = 0; i <= b.length; i++) matrix[i] = [i];
        for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

        // Popunjavanje matrice
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                if (b.charAt(i - 1) === a.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1, // zamena karaktera
                        Math.min(
                            matrix[i][j - 1] + 1, // ubacivanje
                            matrix[i - 1][j] + 1  // brisanje
                        )
                    );
                }
            }
        }

        return matrix[b.length][a.length];
    };

    const dist = distance(c1, c2);
    
    // Za kratke reči dopuštamo manje odstupanje,
    // za duže malo veće.
    const threshold = c1.length <= 4 ? 1 : 2;

    return dist <= threshold;
}

// DELETE ruta za trajno brisanje termina.
app.delete('/api/appointments/:id', (req, res) => {
    try {
        const appointmentId = req.params.id;
        
        // Učitavanje svih termina
        let appointments = readData(DB_APPOINTMENTS);

        // Provera da li termin postoji
        const exists = appointments.some(a => a.id == appointmentId);

        if (!exists) {
            return res.status(404).json({ 
                success: false, 
                message: "Termin nije pronađen u bazi." 
            });
        }

        // Filtriranje niza tako da ostanu svi osim termina koji brišemo
        const filteredAppointments = appointments.filter(a => a.id != appointmentId);

        // Upis novog niza bez obrisanog termina
        writeData(DB_APPOINTMENTS, filteredAppointments);

        // Log u konzoli
        console.log(`[DELETE] Termin ID: ${appointmentId} je storniran.`);
        
        // Potvrda uspeha
        res.json({ 
            success: true, 
            message: "Termin je uspešno obrisan." 
        });

    } catch (err) {
        // Obrada greške
        console.error("Greška pri brisanju termina:", err);
        res.status(500).json({ 
            success: false, 
            message: "Greška na serveru prilikom brisanja." 
        });
    }
});


// POST ruta koja koristi AI da iz slobodnog teksta izvuče:
// - model auta
// - tip usluge
// - vreme
// - ime klijenta
// i zatim pronađe servise koji mogu da odrade taj posao.
app.post('/api/ai/parse-and-find-service', async (req, res) => {
    const { text } = req.body;

    // Log poruke koja se analizira
    console.log("-> Pametna analiza za:", text);

    try {
        // Poziv AI modela da izvuče strukturisane podatke iz slobodnog teksta.
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

        // Parsiranje AI odgovora
        const aiRes = JSON.parse(completion.choices[0].message.content);

        // serviceType koristimo za pretragu servisa
        const searchTag = aiRes.serviceType || "";

        // Traženi termin koji je AI izvukao iz poruke
        const requestedTime = aiRes.time;

        // Učitavamo korisnike i termine iz baze
        const users = readData(DB_USERS);
        const appts = readData(DB_APPOINTMENTS);

        // Tražimo sve servise koji nude uslugu sličnu traženoj.
        const matching = users.filter(u => 
            u.role === 'servis' && 
            Array.isArray(u.services) &&
            u.services.some(s => isSimilar(s.name, searchTag))
        ).map(u => {
            // Broj radnika određuje kapacitet servisa u istom terminu
            const workerCount = parseInt(u.workerCount) || 1;

            // Proveravamo koliko već ima poslova u tačno traženo vreme
            const busyOverall = appts.filter(a => 
                a.serviceName === u.serviceName && 
                a.time === requestedTime && 
                a.status !== 'otkazano'
            ).length;

            // Ako je broj poslova >= broja radnika, servis je pun
            const isFull = busyOverall >= workerCount;

            // Pokušavamo da nađemo cenu odgovarajuće usluge
            const foundService = u.services.find(s => isSimilar(s.name, searchTag));
            const price = foundService ? foundService.price : "Na upit";

            // Ako je servis pun, pokušavamo da pronađemo sledeći slobodan dan
            let nextDay = "Sutra";
            if (isFull) {
                let d = new Date(requestedTime || new Date());

                // Tražimo slobodan termin do 7 dana unapred
                for (let i = 1; i <= 7; i++) {
                    d.setDate(d.getDate() + 1);

                    // Zadržavamo isti format vremena
                    const checkStr = d.toISOString().slice(0, 16);

                    // Proveravamo koliko poslova ima u tom novom terminu
                    const countAtNewTime = appts.filter(a => 
                        a.serviceName === u.serviceName && a.time === checkStr
                    ).length;

                    // Ako ima mesta, to postaje sledeći raspoloživ termin
                    if (countAtNewTime < workerCount) {
                        nextDay = d.toLocaleDateString('sr-RS', { day: 'numeric', month: 'short' });
                        break;
                    }
                }
            }

            // Vraćamo podatke o svakom servisu koji odgovara traženoj usluzi
            return {
                serviceName: u.serviceName,
                price: price,
                isFull,
                nextAvailable: nextDay,
                plan: u.plan
            };
        });

        // Frontendu vraćamo i AI preporuku i listu odgovarajućih servisa
        res.json({ aiRecommendation: aiRes, matchingServices: matching });
    } catch (err) {
        // Obrada greške
        console.error("Greška na serveru:", err.message);
        res.status(500).json({ error: "Greška pri obradi podataka." });
    }
});

// POST ruta za kreiranje novog termina.
app.post('/api/appointments', (req, res) => {
    try {
        // Učitavanje postojećih termina
        const appointments = readData(DB_APPOINTMENTS);
        
        // Provera da li postoje obavezni podaci.
        // Bez servisa, auta i vremena termin nema smisla.
        if (!req.body.serviceName || !req.body.car || !req.body.time) {
            return res.status(400).json({ 
                success: false, 
                message: "Nedostaju ključni podaci (Servis, Auto ili Vreme)." 
            });
        }

        // Ako serviceType nije poslat, stavljamo podrazumevanu vrednost.
        const resolvedServiceType = req.body.serviceType || "Opšti pregled";

        // Ako je cena poslata, koristimo nju.
        // Ako nije, pokušavamo da je automatski uzmemo iz cenovnika servisa.
        const resolvedPrice = parseFloat(req.body.price) || getServicePrice(req.body.serviceName, resolvedServiceType);

        // Formiranje novog termina
        const newAppointment = {
            id: Date.now(), // Jedinstveni ID
            serviceName: req.body.serviceName, // Kod kog servisa se zakazuje
            car: req.body.car,                 // Vozilo
            serviceType: resolvedServiceType,  // Tip usluge
            time: req.body.time,               // Datum i vreme
            client: req.body.client || "Gost", // Ime klijenta
            status: req.body.status || "zakazano", // Početni status
            price: resolvedPrice,              // Cena termina
            createdAt: new Date().toISOString()// Datum kreiranja
        };

        // Dodavanje termina u niz
        appointments.push(newAppointment);

        // Snimanje termina nazad u JSON fajl
        writeData(DB_APPOINTMENTS, appointments);

        // Log za backend
        console.log(`Novi termin zakazan: ${newAppointment.car} kod servisa "${newAppointment.serviceName}"`);
        
        // Potvrda uspešnog kreiranja
        res.status(201).json({ 
            success: true, 
            message: "Termin je uspešno sačuvan u bazi.",
            data: newAppointment 
        });
    } catch (err) {
        // Interna serverska greška
        console.error("Greška pri zakazivanju:", err);
        res.status(500).json({ success: false, message: "Interna greška servera." });
    }
});


// GET ruta koja vraća sve korisnike koji imaju ulogu "servis".
app.get('/api/inventory/all-services', (req, res) => {
    const users = readData(DB_USERS);

    // Filtriranje samo servisa
    const servicesOnly = users.filter(u => u.role === 'servis');

    // Slanje rezultata
    res.json(servicesOnly);
});

// Pokretanje servera na portu 3000.
// Kada se server pokrene, sluša zahteve na adresi http://localhost:3000
app.listen(3000, () => {
  console.log("Server pokrenut na http://localhost:3000");

  // Ispis dodatne informacije o putanji HTML fajlova
  console.log("Putanja do HTML fajlova:", path.join(__dirname, ".."));
});
