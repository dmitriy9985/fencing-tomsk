(function () {
  "use strict";

  const menuButton = document.querySelector("#mobile-menu");
  const navigation = document.querySelector("#site-nav");
  const navigationLinks = Array.from(document.querySelectorAll("#site-nav a"));
  const galleryAlbums = document.querySelector("#gallery-albums");
  let galleryResizeFrame = 0;

  function closeMenu() {
    navigation.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Открыть меню");
    document.body.classList.remove("menu-open");
  }

  function toggleMenu() {
    const willOpen = !navigation.classList.contains("open");
    navigation.classList.toggle("open", willOpen);
    menuButton.setAttribute("aria-expanded", String(willOpen));
    menuButton.setAttribute("aria-label", willOpen ? "Закрыть меню" : "Открыть меню");
    document.body.classList.toggle("menu-open", willOpen);
  }

  menuButton.addEventListener("click", toggleMenu);
  navigationLinks.forEach((link) => link.addEventListener("click", closeMenu));

  document.addEventListener("click", (event) => {
    if (!navigation.contains(event.target) && !menuButton.contains(event.target)) {
      closeMenu();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      menuButton.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 920) {
      closeMenu();
    }
    scheduleGalleryLayout();
  });

  function setGalleryOrientation(image) {
    const figure = image.closest(".gallery-photo");
    if (!figure || !image.naturalWidth || !image.naturalHeight) {
      return;
    }

    const ratio = image.naturalWidth / image.naturalHeight;
    figure.classList.toggle("landscape", ratio > 1.12);
    figure.classList.toggle("portrait", ratio < 0.88);
    figure.classList.toggle("square", ratio >= 0.88 && ratio <= 1.12);
    scheduleGalleryLayout();
  }

  function prepareGalleryImages(root) {
    root.querySelectorAll(".gallery-photo img").forEach((image) => {
      if (image.dataset.masonryReady === "true") {
        return;
      }
      image.dataset.masonryReady = "true";
      image.addEventListener("load", () => setGalleryOrientation(image));
      image.addEventListener("error", scheduleGalleryLayout);
      if (image.complete && image.naturalWidth) {
        setGalleryOrientation(image);
      }
    });
  }

  function layoutGallery() {
    document.querySelectorAll(".gallery-grid").forEach((grid) => {
      const usesGrid = window.getComputedStyle(grid).display === "grid";
      grid.classList.toggle("masonry-ready", usesGrid);
      const gridStyles = window.getComputedStyle(grid);
      const rowHeight = Number.parseFloat(gridStyles.gridAutoRows);
      const rowGap = Number.parseFloat(gridStyles.rowGap);

      grid.querySelectorAll(".gallery-photo").forEach((figure) => {
        figure.style.removeProperty("grid-row-end");
        if (!usesGrid || !rowHeight) {
          return;
        }
        const height = figure.getBoundingClientRect().height;
        const span = Math.max(1, Math.ceil((height + rowGap) / (rowHeight + rowGap)));
        figure.style.gridRowEnd = "span " + span;
      });
    });
  }

  function scheduleGalleryLayout() {
    window.cancelAnimationFrame(galleryResizeFrame);
    galleryResizeFrame = window.requestAnimationFrame(layoutGallery);
  }

  if (galleryAlbums) {
    prepareGalleryImages(galleryAlbums);
    const galleryObserver = new MutationObserver(() => {
      prepareGalleryImages(galleryAlbums);
      scheduleGalleryLayout();
    });
    galleryObserver.observe(galleryAlbums, { childList: true, subtree: true });
    scheduleGalleryLayout();
  }

  if ("IntersectionObserver" in window) {
    const sectionIds = ["home", "news", "calendar", "results", "coaches", "organizations", "gallery", "contacts"];
    const sections = sectionIds.map((id) => document.getElementById(id)).filter(Boolean);
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

      if (!visible) {
        return;
      }

      navigationLinks.forEach((link) => {
        link.classList.toggle("active", link.getAttribute("href") === "#" + visible.target.id);
      });
    }, {
      rootMargin: "-25% 0px -60%",
      threshold: [0, 0.15, 0.45]
    });

    sections.forEach((section) => observer.observe(section));
  }
}());
