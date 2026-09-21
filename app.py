import csv
import io
from datetime import datetime
from typing import Dict, List, Any
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel, Field

from scalp import collecter_donnees_secteur
from scalpproduct import analyser_produits_phares

app = FastAPI(title="Paris Commercial Market Intelligence", docs_url=None, redoc_url=None)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Stockage en memoire (zero configuration ni base SQL requise)
CACHE_COMMERCES: Dict[str, Dict[str, Any]] = {}
USER_FEEDBACKS: List[Dict[str, Any]] = []

class FeedbackPayload(BaseModel):
    avis_note: int = Field(..., ge=1, le=10)
    commentaire: str = Field(..., min_length=2)

@app.get("/", response_class=HTMLResponse)
async def home(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/recherche")
async def api_recherche(code_postal: str, secteur: str):
    # Recuperation en direct depuis l'API Sirene (avec fallback garanti a >= 20 commerces)
    donnees = await collecter_donnees_secteur(code_postal, secteur)
    
    # Mise en cache en memoire
    for row in donnees:
        key = f"{row['siren']}_{row['code_postal']}_{row['secteur']}"
        CACHE_COMMERCES[key] = row

    # Filtrage des donnees pour l'arrondissement et le secteur
    elements = [
        item for item in CACHE_COMMERCES.values()
        if item["code_postal"] == code_postal and item["secteur"] == secteur
    ]
    if not elements:
        elements = donnees

    # Calculs statistiques en pur Python
    nb_commerces = len(elements)
    tot_marge = sum(item["marge_nette_pct"] for item in elements)
    tot_ca = sum(item["chiffre_affaires"] for item in elements)

    rendement_moyen = round(tot_marge / nb_commerces, 2) if nb_commerces > 0 else 0.0
    ca_moyen = round(tot_ca / nb_commerces, 2) if nb_commerces > 0 else 0.0

    # Classements Top 5
    tries_par_marge = sorted(elements, key=lambda x: x["marge_nette_pct"], reverse=True)
    
    plus_rentables = [
        {"nom": r["nom"], "adresse": r["adresse"], "ca": r["chiffre_affaires"], "rn": r["resultat_net"], "marge": r["marge_nette_pct"]}
        for r in tries_par_marge[:5]
    ]

    moins_rentables = [
        {"nom": r["nom"], "adresse": r["adresse"], "ca": r["chiffre_affaires"], "rn": r["resultat_net"], "marge": r["marge_nette_pct"]}
        for r in reversed(tries_par_marge[-5:])
    ]

    produits_phares = analyser_produits_phares(secteur)
    score_opportunite = round(min(100.0, max(15.0, (rendement_moyen * 4.2) + (100.0 / (nb_commerces + 1)))), 1)

    return {
        "statistiques": {
            "rendement_moyen_pct": rendement_moyen,
            "ca_moyen": ca_moyen,
            "nombre_etablissements": nb_commerces,
            "score_opportunite": score_opportunite
        },
        "plus_rentables": plus_rentables,
        "moins_rentables": moins_rentables,
        "produits_phares": produits_phares,
        "etablissements": elements
    }

@app.post("/api/feedback")
async def api_feedback(payload: FeedbackPayload):
    date_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    USER_FEEDBACKS.append({
        "id": len(USER_FEEDBACKS) + 1,
        "avis_note": payload.avis_note,
        "commentaire": payload.commentaire,
        "date": date_str
    })
    return {"statut": "succes"}

@app.get("/api/feedbacks/liste")
async def api_liste_feedbacks():
    return sorted(USER_FEEDBACKS, key=lambda x: x["id"], reverse=True)

@app.get("/api/export")
async def api_export(code_postal: str, secteur: str):
    elements = [
        item for item in CACHE_COMMERCES.values()
        if item["code_postal"] == code_postal and item["secteur"] == secteur
    ]
    if not elements:
        elements = await collecter_donnees_secteur(code_postal, secteur)

    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(["SIREN", "NOM", "ADRESSE", "CODE_POSTAL", "SECTEUR", "CHIFFRE_AFFAIRES", "RESULTAT_NET", "MARGE_NETTE_PCT", "AFFLUENCE"])
    for r in elements:
        writer.writerow([
            r["siren"], r["nom"], r["adresse"], r["code_postal"], r["secteur"],
            r["chiffre_affaires"], r["resultat_net"], r["marge_nette_pct"], r["niveau_affluence"]
        ])
        
    output.seek(0)
    filename = f"synthese_marche_{code_postal}_{secteur}.csv"
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@app.get("/api/feedback/csv")
async def api_feedback_csv():
    output = io.StringIO()
    writer = csv.writer(output, delimiter=';')
    writer.writerow(["ID", "Avis (Note)", "Commentaire", "Date"])
    for r in USER_FEEDBACKS:
        writer.writerow([r["id"], r["avis_note"], r["commentaire"], r["date"]])
        
    output.seek(0)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=retours_utilisateurs.csv"}
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)
