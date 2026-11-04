async function fetchJSON(path, options) {
  const response = await fetch(`./${path}.json`, options);
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json();
}

export async function loadDatasets() {
  const required = [
    'data',
    'imports',
    'context',
    'demand',
    'latest-demand',
    'survey',
    'opportunities',
  ];
  const fresh = new Set(['imports', 'survey', 'opportunities']);
  const entries = await Promise.all(
    required.map(async (name) => [
      name,
      await fetchJSON(name, fresh.has(name) ? { cache: 'no-cache' } : undefined),
    ]),
  );
  // Saved prose is optional; losing it must not disable numerical analysis.
  const explanations = await fetchJSON('ai-explanations', { cache: 'no-cache' }).catch(() => null);
  return { ...Object.fromEntries(entries), explanations };
}
