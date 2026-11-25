(function () {
  "use strict";

  const albums = document.getElementById("gallery-albums");
  const viewer = document.getElementById("gallery-viewer");
  if (typeof viewer.showModal !== "function") return;

  const image = document.getElementById("gallery-viewer-image");
  const caption = document.getElementById("gallery-viewer-caption");
  const position = document.getElementById("gallery-viewer-position");
  const closeButton = document.getElementById("gallery-viewer-close");
  const previous = viewer.querySelector('[data-gallery-step="-1"]');
  const next = viewer.querySelector('[data-gallery-step="1"]');
  let photos = [];
  let index = 0;
  let opener;

  function showPhoto(photoIndex) {
    index = photoIndex;
    const link = photos[index];
    image.alt = link.querySelector("img").alt;
    image.src = link.href;
    caption.textContent = link.closest("figure").querySelector("figcaption").textContent;
    position.textContent = (index + 1) + " / " + photos.length;
    previous.disabled = photos.length < 2;
    next.disabled = photos.length < 2;
  }

  function step(offset) {
    if (photos.length > 1) showPhoto((index + offset + photos.length) % photos.length);
  }

  albums.addEventListener("click", (event) => {
    const link = event.target.closest(".gallery-photo-frame[href]");
    if (!link || event.defaultPrevented || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;

    event.preventDefault();
    photos = Array.from(link.closest(".gallery-grid").querySelectorAll(".gallery-photo-frame[href]"));
    opener = link;
    showPhoto(photos.indexOf(link));
    viewer.showModal();
  });

  previous.addEventListener("click", () => step(-1));
  next.addEventListener("click", () => step(1));
  closeButton.addEventListener("click", () => viewer.close());
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) viewer.close();
  });
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      step(event.key === "ArrowLeft" ? -1 : 1);
    }
  });
  viewer.addEventListener("close", () => {
    opener?.focus({ preventScroll: true });
    image.removeAttribute("src");
  });
}());
