(function () {
  "use strict";

  const menuButton = document.querySelector("#mobile-menu");
  const navigation = document.querySelector("#site-nav");
  const navigationLinks = Array.from(document.querySelectorAll("#site-nav a"));
  const more = navigation.querySelector(".nav-more");

  navigationLinks.forEach((link) => {
    const isCurrent = link.dataset.nav === document.body.dataset.page;
    link.classList.toggle("active", isCurrent);
    if (isCurrent) {
      link.setAttribute("aria-current", "page");
    }
  });

  function closeMenu() {
    if (more) more.open = false;
    navigation.classList.remove("open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Открыть меню");
    document.body.classList.remove("menu-open");
  }

  function toggleMenu() {
    const willOpen = !navigation.classList.contains("open");
    if (!willOpen && more) more.open = false;
    navigation.classList.toggle("open", willOpen);
    menuButton.setAttribute("aria-expanded", String(willOpen));
    menuButton.setAttribute("aria-label", willOpen ? "Закрыть меню" : "Открыть меню");
    document.body.classList.toggle("menu-open", willOpen);
  }

  menuButton.addEventListener("click", toggleMenu);
  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });

  document.addEventListener("click", (event) => {
    if (more && !more.contains(event.target)) more.open = false;
    if (!navigation.contains(event.target) && !menuButton.contains(event.target)) {
      closeMenu();
    }
  });

  more?.addEventListener("focusout", (event) => {
    // A pointer press can blur the summary before the nested link receives its click.
    if (event.relatedTarget && !more.contains(event.relatedTarget)) more.open = false;
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (more?.open) {
      more.open = false;
      more.querySelector("summary").focus();
    } else if (navigation.classList.contains("open")) {
      closeMenu();
      menuButton.focus();
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 920 && navigation.classList.contains("open")) {
      closeMenu();
    }
  });
}());
