# Matthew C. Gee — Author Website

A marketing site for author Matthew C. Gee, MBA — built to introduce his debut book
**Roots Before Branches: Reestablishing Connection in Healthcare, Leadership, and Society**,
his children's picture book **Candice and Sam's Big Adventure**, and to promote his
availability for speaking engagements. Both books release **Summer 2026** through
Palmetto Publishing.

The visual design (deep charcoal background, warm gold accents, the illuminated
tree-and-roots motif, and serif display type) is drawn directly from the cover of
*Roots Before Branches*.

## Structure

This is a static site — no build step required:

```
index.html        Single-page site: hero, about, books, speaking, contact
css/style.css     Design system and layout
js/main.js        Mobile nav toggle + footer year
images/           Book covers, author portrait, and tree-mark/illustration SVGs
```

## Running locally

Any static file server works, e.g.:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Publishing to GitHub Pages

A workflow at `.github/workflows/pages.yml` deploys the site to GitHub Pages on every
push to `main`. To turn it on:

1. Push this repository to GitHub.
2. In the repo, go to **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow manually from the **Actions** tab).

The site will then be published at `https://<your-username>.github.io/<repo-name>/`.

## Updating content

- **Pre-order / retailer links:** Each book card has a `retailer-row` in `index.html`
  with placeholder pills for Amazon and Barnes & Noble. Replace those `<span>` elements
  with `<a class="retailer-pill is-link" href="...">` links once the live product pages
  exist.
- **Contact email:** Set in two places in `index.html` — the speaking "Request to Book
  Matthew" button and the Contact section.
- **Custom domain:** To use a custom domain with GitHub Pages, add a `CNAME` file at the
  repository root containing the domain name, and configure your DNS accordingly.
