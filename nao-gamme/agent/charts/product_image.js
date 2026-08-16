// Plugin chart custom : affiche la photo réelle d'un article (pas un lien).
// Data attendue (1 ligne) : { image_url, caption }
// Flux : gamme_image_article (MCP) → execute_sql SELECT '<url>' AS image_url,
// '<libelle>' AS caption → display_chart chart_type=product_image.
export function render(element, context) {
  const row = context.data && context.data.length ? context.data[0] : null;
  element.replaceChildren();

  if (!row || !row.image_url) {
    element.textContent = "Aucune image disponible pour cet article.";
    return;
  }

  const img = document.createElement("img");
  img.src = row.image_url;
  img.alt = row.caption || "";
  img.style.maxWidth = "320px";
  img.style.maxHeight = "320px";
  img.style.borderRadius = "12px";
  img.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.25)";
  img.style.display = "block";
  img.style.margin = "0 auto";
  element.appendChild(img);

  if (row.caption) {
    const caption = document.createElement("div");
    caption.textContent = row.caption;
    caption.style.marginTop = "8px";
    caption.style.fontSize = "14px";
    caption.style.textAlign = "center";
    caption.style.color = context.theme === "dark" ? "#e5e5e5" : "#444";
    element.appendChild(caption);
  }
}