# ProGarage

ProGarage je MVP web aplikacija za digitalizaciju poslovanja auto-servisa. Aplikacija omogućava zakazivanje termina, praćenje statusa popravki, pregled prihoda, upravljanje zalihama delova u magacinu i AI obradu korisničkih zahteva.

## Opis projekta

Cilj projekta je da se unapredi organizacija rada auto-servisa kroz jedinstven informacioni sistem. ProGarage povezuje više poslovnih procesa u jednu celinu: prijem zahteva, praćenje rada, osnovni pregled prihoda i evidenciju delova.

Projekat je razvijen kao deo studentskog rada iz predmeta Elektronsko poslovanje.

## Glavne funkcionalnosti

- registracija i prijava korisnika
- zakazivanje termina za servis
- pregled termina kroz kalendar
- promena statusa popravke
- automatski obračun prihoda nakon završetka popravke
- evidencija delova u magacinu
- AI analiza korisničkog zahteva
- AI preporuka za nabavku delova

## Tehnologije

### Frontend
- HTML5
- Tailwind CSS
- JavaScript

### Backend
- Node.js
- Express.js

### Skladištenje podataka
- JSON fajlovi

### AI integracija
- Groq API

## Struktura projekta

```text
.
├── index.html
├── login.html
├── register.html
├── dashboard.html
├── calendar.html
├── inventory.html
└── server
    ├── server.js
    ├── package.json
    ├── package-lock.json
    ├── env.json
    └── db
        ├── users.json
        ├── appointments.json
        └── inventory.json
```

## Pokretanje projekta

### 1. Preuzimanje projekta
Preuzeti projekat sa GitHub-a i otvoriti folder projekta.

### 2. Instalacija potrebnih paketa
Otvoriti terminal u folderu `server` i pokrenuti:

```bash
npm install
```

### 3. Pokretanje backend servera
U istom folderu pokrenuti:

```bash
node server.js
```

### 4. Pokretanje frontend dela
Nakon pokretanja servera, otvoriti HTML fajlove u browser-u, na primer:
- `index.html`
- `login.html`
- `register.html`
- `dashboard.html`
- `calendar.html`
- `inventory.html`

## API konfiguracija

Za AI funkcionalnosti potreban je API ključ. U folderu `server` nalazi se fajl `env.json`i fajl `server.js` u kome se čuva konfiguracija.

Primer sadržaja:

```json
{
  "GROQ_API_KEY": "OVDE_JE_POTREBNO_UNETI_API_KLJUC"
}
```
```js
    const groq = new Groq({ apiKey: "OVDE_JE_POTREBNO_UNETI_API_KLJUC"});
```

## Napomena

Projekat je razvijen kao MVP verzija sistema. Podaci se čuvaju lokalno u JSON fajlovima i aplikacija nije namenjena produkcionom okruženju, već demonstraciji poslovne ideje i tehničke implementacije.

## Autori

#### Autori projekta: 

- Baščarević Milija [2025/0213]
- Vlašković Mateja [2025/0422]
- Krstić Marko [2025/0118]

## Predmet

Elektronsko poslovanje  
Fakultet organizacionih nauka
