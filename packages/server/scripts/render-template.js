import Mustache from "mustache";

/**
 * @param {string} html
 */
function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * @param {unknown} partialsConfig
 */
async function loadPartials(partialsConfig) {
  /** @type {Record<string, string>} */
  const partials = {};
  if (partialsConfig == null) return partials;
  if (typeof partialsConfig !== "object" || Array.isArray(partialsConfig)) {
    throw new Error("config.partials must be an object");
  }

  for (const [partialName, pageName] of Object.entries(
    /** @type {Record<string, unknown>} */ (partialsConfig),
  )) {
    if (typeof pageName !== "string" || pageName.length === 0) {
      throw new Error(`config.partials.${partialName} must be a template page name`);
    }
    partials[partialName] = await $responses.getTemplate(pageName);
  }
  return partials;
}

async function renderTemplate(ctx) {
  const templateName = ctx.config?.template;
  if (typeof templateName !== "string" || templateName.length === 0) {
    throw new Error("config.template is required");
  }

  const vars = ctx.data?.vars ?? ctx.data;
  if (vars == null || typeof vars !== "object" || Array.isArray(vars)) {
    throw new Error("data.vars must be an object");
  }

  const template = await $responses.getTemplate(templateName);
  const partials = await loadPartials(ctx.config?.partials);

  log.info(
    {
      template: templateName,
      partials: Object.keys(partials),
      varKeys: Object.keys(vars),
    },
    "render-template: rendering mustache template",
  );

  const html = Mustache.render(template, vars, partials);
  const text = htmlToText(html);

  return {
    output: {
      html,
      text,
      template: templateName,
    },
    context:
      ctx.context != null && typeof ctx.context === "object" && !Array.isArray(ctx.context)
        ? ctx.context
        : {},
  };
}

renderTemplate.meta = {
  description:
    "Render an HTML template from Responses (kind: template) with Mustache and return html + plain-text fallback",
  previewConfigKey: "template",
  config: {
    template: {
      type: "string",
      required: true,
      description: "Responses page name with kind=template",
    },
    partials: {
      type: "object",
      required: false,
      description: "Map of partial name to template page name (e.g. { item: email-item })",
    },
  },
  input: {
    vars: {
      type: "object",
      required: true,
      description: "Mustache view data (title, items, etc.)",
    },
  },
  output: {
    html: { type: "string", description: "Rendered HTML" },
    text: { type: "string", description: "Plain-text fallback stripped from HTML" },
    template: { type: "string", description: "Template page name used" },
  },
  example: {
    data: {
      vars: {
        title: "Daily digest",
        message: "Latest items from your feed.",
        items: [
          {
            title: "Example post",
            link: "https://example.com/post",
            summary: "A short summary.",
          },
        ],
      },
    },
    config: {
      template: "email-default",
    },
  },
};

export default renderTemplate;
