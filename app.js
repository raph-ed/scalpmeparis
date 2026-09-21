let map = null;
let currentMarkers = [];

document.addEventListener("DOMContentLoaded", () => {
    init3DMap();

    const btnRechercher = document.getElementById("btn-rechercher");
    const btnExporter = document.getElementById("btn-exporter");
    const formFeedback = document.getElementById("form-feedback");
    const feedbackToggle = document.getElementById("feedback-toggle");
    const feedbackPopover = document.getElementById("feedback-popover");
    const feedbackClose = document.getElementById("feedback-close");
    const linkViewFeedbacks = document.getElementById("link-view-feedbacks");
    const modalFeedbacks = document.getElementById("modal-feedbacks");
    const modalClose = document.getElementById("modal-close");

    btnRechercher.addEventListener("click", executerRecherche);

    btnExporter.addEventListener("click", () => {
        const cp = document.getElementById("code_postal").value;
        const sec = document.getElementById("secteur").value;
        window.location.href = `/api/export?code_postal=${cp}&secteur=${sec}`;
    });

    feedbackToggle.addEventListener("click", () => feedbackPopover.classList.toggle("hidden"));
    feedbackClose.addEventListener("click", () => feedbackPopover.classList.add("hidden"));

    formFeedback.addEventListener("submit", async (e) => {
        e.preventDefault();
        const note = parseInt(document.getElementById("feedback-note").value, 10);
        const comm = document.getElementById("feedback-comm").value;

        const res = await fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ avis_note: note, commentaire: comm })
        });

        if (res.ok) {
            alert("Merci pour votre retour !");
            formFeedback.reset();
            feedbackPopover.classList.add("hidden");
        }
    });

    linkViewFeedbacks.addEventListener("click", async (e) => {
        e.preventDefault();
        await chargerFeedbacks();
        modalFeedbacks.classList.remove("hidden");
    });

    modalClose.addEventListener("click", () => modalFeedbacks.classList.add("hidden"));
});

function init3DMap() {
    map = new maplibregl.Map({
        container: "map",
        style: {
            version: 8,
            sources: {
                "esri-satellite": {
                    type: "raster",
                    tiles: [
                        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                    ],
                    tileSize: 256,
                    attribution: "Esri Satellite"
                }
            },
            layers: [
                {
                    id: "satellite-layer",
                    type: "raster",
                    source: "esri-satellite",
                    minzoom: 0,
                    maxzoom: 19
                }
            ]
        },
        center: [2.3488, 48.8534],
        zoom: 14.2,
        pitch: 55,
        bearing: -15,
        antialias: true
    });

    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
}

async function executerRecherche() {
    const cp = document.getElementById("code_postal").value;
    const sec = document.getElementById("secteur").value;
    const btn = document.getElementById("btn-rechercher");
    const resultsArea = document.getElementById("results-area");
    const btnExporter = document.getElementById("btn-exporter");

    btn.textContent = "Extraction en direct...";
    btn.disabled = true;

    try {
        const response = await fetch(`/api/recherche?code_postal=${cp}&secteur=${sec}`);
        const data = await response.json();

        afficherResultats(data);
        resultsArea.classList.remove("hidden");
        btnExporter.disabled = false;
        setTimeout(() => { map.resize(); }, 150);
    } catch (err) {
        alert("Erreur lors de l'extraction des donnees.");
    } finally {
        btn.textContent = "Lancer le scan";
        btn.disabled = false;
    }
}

function afficherResultats(data) {
    document.getElementById("kpi-marge").textContent = `${data.statistiques.rendement_moyen_pct} %`;
    document.getElementById("kpi-ca").textContent = `${data.statistiques.ca_moyen.toLocaleString("fr-FR")} €`;
    document.getElementById("kpi-count").textContent = data.statistiques.nombre_etablissements;
    document.getElementById("kpi-score").textContent = `${data.statistiques.score_opportunite} / 100`;

    // Suppression des anciens marqueurs
    currentMarkers.forEach(m => m.remove());
    currentMarkers = [];

    if (data.etablissements.length === 0) return;

    let avgLat = 0;
    let avgLon = 0;

    data.etablissements.forEach(item => {
        avgLat += item.latitude;
        avgLon += item.longitude;

        const el = document.createElement("div");
        el.className = "marker-3d";
        el.style.backgroundColor = item.couleur_hex;
        el.style.width = "16px";
        el.style.height = "16px";
        el.style.borderRadius = "50%";
        el.style.border = "2px solid #ffffff";
        el.style.boxShadow = `0 0 12px ${item.couleur_hex}`;
        el.style.cursor = "pointer";

        const popup = new maplibregl.Popup({ offset: 15 }).setHTML(`
            <div style="font-family: monospace; font-size: 12px; color: #111; padding: 4px;">
                <strong style="font-size: 13px;">${item.nom}</strong><br>
                <span style="color: #666;">${item.adresse}</span><hr style="margin: 6px 0; border: 0; border-top: 1px solid #eee;">
                Statut: <b>${item.niveau_affluence}</b><br>
                CA Estime: <b>${item.chiffre_affaires.toLocaleString("fr-FR")} €</b><br>
                Marge Nette: <b>${item.marge_nette_pct} %</b>
            </div>
        `);

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([item.longitude, item.latitude])
            .setPopup(popup)
            .addTo(map);

        currentMarkers.push(marker);
    });

    avgLat /= data.etablissements.length;
    avgLon /= data.etablissements.length;

    map.flyTo({
        center: [avgLon, avgLat],
        zoom: 14.8,
        pitch: 58,
        bearing: Math.floor(Math.random() * 30) - 15,
        essential: true,
        speed: 1.2
    });

    const prodContainer = document.getElementById("products-container");
    prodContainer.innerHTML = "";
    data.produits_phares.forEach(p => {
        const card = document.createElement("div");
        card.className = "product-card";
        card.innerHTML = `
            <div class="product-name">${p.produit}</div>
            <div class="product-meta">Prix Moyen : ${p.prix_moyen.toFixed(2)} €</div>
            <div class="product-meta">Indice Demande : ${p.indice_popularite} / 100</div>
        `;
        prodContainer.appendChild(card);
    });

    remplirTable("table-plus-rentables", data.plus_rentables);
    remplirTable("table-moins-rentables", data.moins_rentables);
}

function remplirTable(tableId, records) {
    const tbody = document.querySelector(`#${tableId} tbody`);
    tbody.innerHTML = "";
    records.forEach(r => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${r.nom}</td>
            <td>${r.marge} %</td>
            <td>${r.ca.toLocaleString("fr-FR")} €</td>
        `;
        tbody.appendChild(row);
    });
}

async function chargerFeedbacks() {
    const res = await fetch("/api/feedbacks/liste");
    const items = await res.json();
    const tbody = document.querySelector("#table-feedbacks tbody");
    tbody.innerHTML = "";

    items.forEach(i => {
        const row = document.createElement("tr");
        row.innerHTML = `
            <td>${i.date}</td>
            <td><b>${i.avis_note} / 10</b></td>
            <td>${i.commentaire}</td>
        `;
        tbody.appendChild(row);
    });
}
