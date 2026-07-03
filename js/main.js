window.addEventListener('load', function () { window.scrollTo(0, 0); });

document.addEventListener('DOMContentLoaded', function () {
  // Footer year
  var yearEl = document.getElementById('year');
  if (yearEl) {
    yearEl.textContent = new Date().getFullYear();
  }

  // Smooth scroll for internal anchor links (replaces CSS scroll-behavior:smooth
  // so programmatic snap-to-top is never accidentally animated).
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      var target = document.querySelector(this.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Mobile nav toggle
  var toggle = document.getElementById('navToggle');
  var links = document.getElementById('navLinks');

  if (toggle && links) {
    toggle.addEventListener('click', function () {
      var isOpen = links.classList.toggle('is-open');
      toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    links.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        links.classList.remove('is-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // Announcement modal: Roots Before Branches, coming July 2026
  // Shown on every page load.
  var modal = document.getElementById('announcementModal');
  if (modal) {
    var closeBtn = document.getElementById('announcementClose');
    var dismissBtn = document.getElementById('announcementDismiss');
    var ctaLink = document.getElementById('announcementCta');

    function closeModal() {
      modal.classList.remove('is-visible');
      window.setTimeout(function () {
        modal.hidden = true;
      }, 300);
    }

    window.setTimeout(function () {
      modal.hidden = false;
      requestAnimationFrame(function () {
        modal.classList.add('is-visible');
      });
    }, 600);

    [closeBtn, dismissBtn, ctaLink].forEach(function (el) {
      if (el) {
        el.addEventListener('click', closeModal);
      }
    });

    modal.addEventListener('click', function (event) {
      if (event.target === modal) {
        closeModal();
      }
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !modal.hidden) {
        closeModal();
      }
    });
  }
});
