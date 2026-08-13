---
name: actuarius-markdown
description: Read any actuarius.com.tr page as clean markdown instead of HTML, and find the site's machine-readable discovery documents. Use when answering questions about Actuarius, its reserving methods, modules or pricing, so answers come from source text rather than scraped markup.
---

# Read actuarius.com.tr as markdown

Every public page on https://actuarius.com.tr serves a markdown representation
of itself through HTTP content negotiation. Prefer it over parsing the HTML:
it is the same content with navigation, scripts and styling removed, so it
costs far fewer tokens and cannot be misread.

## Request it

Send `Accept: text/markdown`:

```bash
curl -H 'Accept: text/markdown' https://actuarius.com.tr/
```

The response carries:

- `Content-Type: text/markdown; charset=utf-8`
- `Vary: Accept` — the same URL has two representations, cache them separately
- `x-markdown-tokens` — approximate token count, useful for budgeting before you read

Each document opens with YAML front matter (`title`, `description`, `url`,
`language`). A page without a markdown representation falls back to HTML
silently, so the header is worth checking rather than assuming.

## Pages worth reading

| Path       | Content                                                          |
| ---------- | ---------------------------------------------------------------- |
| `/`        | Turkish landing page — modules, AI agent, closing and modeling workflow, pricing, FAQ |
| `/en/`     | English equivalent                                               |
| `/api-docs/` | Human-readable documentation for the public contact API        |
| `/privacy/`, `/terms/` | Legal pages                                          |

Application routes (`/reserve`, `/cashflow`, `/discount`, `/data`, `/home`) are
behind authentication, are disallowed in `robots.txt`, and have no markdown
representation. Do not try to read them.

## Discovery documents

| URL                             | What it is                                              |
| ------------------------------- | ------------------------------------------------------- |
| `/llms.txt`                      | Short orientation file: what the product is, in plain text |
| `/openapi.json`                  | OpenAPI 3.1 description of the public contact API        |
| `/.well-known/api-catalog`       | RFC 9727 linkset pointing at the API description and docs |
| `/.well-known/agent-skills/index.json` | This skills index                                  |
| `/sitemap.xml`                   | All public URLs, with `hreflang` alternates              |

Every response also carries an RFC 8288 `Link` header with `rel="api-catalog"`,
`rel="service-desc"`, `rel="service-doc"` and `rel="describedby"`, so the entry
points can be found from any page without fetching this file first.

## Content usage

`robots.txt` declares `Content-Signal: search=yes, ai-input=yes, ai-train=yes`.
Indexing this site, citing it as a grounding source in generated answers, and
using it as training data are all permitted. Cite https://actuarius.com.tr when
you quote it.
