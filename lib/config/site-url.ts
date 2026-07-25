const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function parseHttpUrl(candidate?: string) {
  if (!candidate?.trim()) return null;

  const value = candidate.trim();
  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;

  try {
    const url = new URL(withProtocol);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

export function isLocalSiteUrl(candidate?: string) {
  const url = parseHttpUrl(candidate);
  return url ? LOCAL_HOSTNAMES.has(url.hostname) : false;
}

export function resolveServerSiteUrl(options: {
  publicSiteUrl?: string;
  vercelProductionUrl?: string;
  vercelUrl?: string;
}) {
  const configured = parseHttpUrl(options.publicSiteUrl);
  const deployed = parseHttpUrl(options.vercelProductionUrl ?? options.vercelUrl);

  if (configured && (!isLocalSiteUrl(configured.toString()) || !deployed)) {
    return configured;
  }

  return deployed ?? configured ?? new URL("http://localhost:3000");
}

export function resolveShareBaseUrl(siteUrl?: string, currentOrigin?: string) {
  const configured = parseHttpUrl(siteUrl);
  const runtime = parseHttpUrl(currentOrigin);

  if (runtime && (!configured || (isLocalSiteUrl(configured.toString()) && !isLocalSiteUrl(runtime.toString())))) {
    return runtime;
  }

  return configured ?? runtime ?? new URL("http://localhost:3000");
}
