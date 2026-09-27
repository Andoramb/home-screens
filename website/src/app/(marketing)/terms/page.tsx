import { type Metadata } from 'next'

import { Footer } from '@/components/Footer'
import { Header } from '@/components/Header'
import { metadataFor, renderMarkdoc } from '@/lib/markdoc'

export const metadata: Metadata = metadataFor('legal', 'terms')

export default function TermsPage() {
  return (
    <>
      <Header />
      <main className="pt-20">{renderMarkdoc('legal', 'terms').rendered}</main>
      <Footer />
    </>
  )
}
