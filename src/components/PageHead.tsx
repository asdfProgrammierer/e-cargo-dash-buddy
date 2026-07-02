import { Helmet } from "react-helmet-async";

const SITE_URL = "https://ecargo-connect.ecargo-logistik.de";

interface PageHeadProps {
  title: string;
  description: string;
  path: string;
}

/**
 * Per-route <title>, meta description, canonical and og:url.
 * Mutates document.head client-side; sitewide fallbacks stay in index.html
 * so social-preview crawlers (which don't run JS) still get valid metadata.
 */
export function PageHead({ title, description, path }: PageHeadProps) {
  const url = `${SITE_URL}${path}`;
  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
    </Helmet>
  );
}