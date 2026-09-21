# Paris Commercial Market Intelligence

Application web interactive pour identifier les opportunités de commerces et niches par arrondissement à Paris.

## 🚀 Démarrage rapide

1. **Installer les dépendances** :
```bash
pip install -r requirements.txt
```

2. **Lancer l'application** :
```bash
python app.py
```
ou :
```bash
uvicorn app:app --reload
```

3. **Ouvrir le navigateur** sur [http://127.0.0.1:8000](http://127.0.0.1:8000).

## 🛠 Caractéristiques
- **Zéro base de données SQL** : aucun driver ni configuration requis.
- **Récupération garantie** : au moins 20 commerces par arrondissement (via API Entreprises gouv + complétion sectorielle géolocalisée).
- **Cartographie 3D interactive** avec MapLibre GL.
- **Analyses financières & best-sellers** par secteur.
- **Exportation CSV** des analyses de marché.
