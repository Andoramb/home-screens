import { type Node } from '@markdoc/markdoc'

import { Prose } from '@/components/docs/Prose'
import { TableOfContents } from '@/components/docs/TableOfContents'
import { collectSections } from '@/lib/sections'

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/** The privacy policy and terms: the blog article chrome without byline, image or structured data. */
export function LegalPageLayout({
  children,
  frontmatter,
  nodes,
}: {
  children: React.ReactNode
  frontmatter: Record<string, string | undefined>
  nodes: Array<Node>
}) {
  const tableOfContents = collectSections(nodes)
  const { title, effective } = frontmatter

  return (
    <div className="relative mx-auto flex w-full max-w-7xl justify-center px-4 sm:px-6 lg:px-8">
      <div className="min-w-0 max-w-3xl flex-auto py-16 xl:pr-16">
        <article>
          <header className="mb-10">
            {title && (
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                {title}
              </h1>
            )}
            {effective && (
              <p className="mt-4 text-sm text-neutral-400">
                Effective <time dateTime={effective}>{formatDate(effective)}</time>
              </p>
            )}
          </header>

          <Prose className="dark:text-neutral-300 dark:prose-headings:text-white dark:prose-a:text-cyan-400 dark:prose-strong:text-white dark:prose-code:text-white">
            {children}
          </Prose>
        </article>
      </div>

      <TableOfContents tableOfContents={tableOfContents} />
    </div>
  )
}
