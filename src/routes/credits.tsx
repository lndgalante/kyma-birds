import { createFileRoute } from '@tanstack/react-router'
import { CreditsPage } from '~/components/credits/CreditsPage'
import { creditsHead } from '~/lib/head'
import { getBirds } from '~/lib/manifest'
import { absoluteUrl } from '~/lib/site'
import { validateBirdSearch } from '~/lib/search'

export const Route = createFileRoute('/credits')({
  validateSearch: validateBirdSearch,
  head: () => {
    const { meta, links } = creditsHead()
    // One ImageObject per photo, so search engines can show the licence with the image.
    const graph = getBirds().map((b) => ({
      '@type': 'ImageObject',
      contentUrl: absoluteUrl(b.photo.src),
      name: b.commonName,
      creator: { '@type': 'Person', name: b.credits.photo.author },
      license: b.credits.photo.licenseUrl,
      acquireLicensePage: b.credits.photo.source,
      creditText: `${b.credits.photo.author}, ${b.credits.photo.license}`,
    }))
    const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
    return {
      meta,
      links,
      scripts: [{ type: 'application/ld+json', children: json.replace(/</g, '\\u003c') }],
    }
  },
  component: Credits,
})

function Credits() {
  const { bird } = Route.useSearch()
  return <CreditsPage birds={getBirds()} highlight={bird} />
}
