# Pitkävetotulokset

Sivu näyttää viimeisen 14 päivän pelattujen otteluiden tulokset ja niiden 1X2-lopputuloksen. Sarjat ovat Liiga, Mestis, NHL, NBA, Valioliiga, La Liga ja Mestarien liiga.

Tulokset haetaan aina, kun sivu ladataan.

## Rakenne

```
public/index.html                 sivu (ulkoasu ja näkymä)
netlify/functions/results.mjs     funktio, joka hakee tulokset osoitteeseen /api/results
netlify.toml                      Netlifyn asetukset
```

## Julkaisu Netlifyyn GitHubin kautta

1. Luo GitHubiin uusi repo ja pushaa tämän kansion sisältö sinne.
2. Valitse Netlifyssä Add new site → Import an existing project → GitHub ja valitse repo.
3. Netlify lukee asetukset netlify.toml-tiedostosta, joten build-asetuksiin ei tarvitse koskea. Paina Deploy.

Sen jälkeen jokainen push GitHubiin julkaisee sivun automaattisesti.

## Testaus omalla koneella

```
npm install -g netlify-cli
netlify dev
```

Sivu aukeaa osoitteeseen http://localhost:8888.

## Asetukset

Asetukset ovat tiedoston `netlify/functions/results.mjs` alussa:

- `DAYS` kertoo, montako päivää taaksepäin tulokset haetaan (oletus 14).
- `CACHE_SECONDS` kertoo, kuinka kauan Netlify pitää vastauksen välimuistissa (oletus 120 sekuntia). Arvon 0 kanssa tulokset haetaan lähteistä joka latauksella. Silloin sivu latautuu hitaammin, noin 3 sekunnissa.
- Sarjoja voi lisätä `ESPN_LEAGUES`-listaan.

## Huomioita

- 1X2-tulos lasketaan varsinaisen peliajan mukaan. Jatkoajalla tai voittolaukauksilla ratkennut kiekko-ottelu merkitään tasapeliksi (X).
- Funktio hakee vain runkosarjat. Pudotuspelit pitää lisätä ennen kevättä.
- Mestiksen tulokset luetaan sivuston HTML:stä, joten haku voi rikkoutua, jos mestis.fi:n rakenne muuttuu.
- Kertoimet eivät ole mukana, koska Pitkävedolle ei ole julkista rajapintaa.
