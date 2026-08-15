const DEFAULT_EMAIL_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>{{title}}</title>
</head>
<body>
  <h1>{{title}}</h1>
  {{#message}}
  <p>{{message}}</p>
  {{/message}}

  <ul>
    {{#items}}
    <li>
      <a href="{{link}}">{{title}}</a>
      {{#summary}}<p>{{summary}}</p>{{/summary}}
    </li>
    {{/items}}
  </ul>
  {{^items}}
  <p>No items.</p>
  {{/items}}
</body>
</html>
`;

/**
 * @param {import("knex").Knex} knex
 */
export async function up(knex) {
  await knex.schema.alterTable("http_pages", (t) => {
    t.text("kind").notNullable().defaultTo("response");
    t.integer("system").notNullable().defaultTo(0);
  });

  const now = new Date().toISOString();
  const existing = await knex("http_pages").where({ name: "email-default" }).first();
  if (!existing) {
    await knex("http_pages").insert({
      id: "00000000-0000-4000-8000-000000000001",
      name: "email-default",
      content: DEFAULT_EMAIL_TEMPLATE,
      mime: "html",
      status: 200,
      kind: "template",
      system: 1,
      created_at: now,
      updated_at: now,
    });
  }
}

/**
 * @param {import("knex").Knex} knex
 */
export async function down(knex) {
  await knex("http_pages").where({ name: "email-default", system: 1 }).del();
  await knex.schema.alterTable("http_pages", (t) => {
    t.dropColumn("kind");
    t.dropColumn("system");
  });
}
