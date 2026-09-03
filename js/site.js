(function () {
  "use strict";

  const menuButton = document.querySelector("#mobile-menu");
  const navigation = document.querySelector("#site-nav");
  const navigationLinks = Array.from(document.querySelectorAll("#site-nav a"));

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
  });

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
