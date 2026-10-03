// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nProvider } from '@/i18n/provider';
import en from '@/translations/en-US/editor.json';
import NasaBrowser from '../NasaBrowser';
import ImmichBrowser from '../ImmichBrowser';

const fetchMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editor-fetch', () => ({ editorFetch: fetchMock }));
vi.mock('@/hooks/useEditorData', () => ({ useEditorData: () => ({ data: [] }) }));
vi.mock('../ImageSearchBrowser', () => ({
  default: ({ onSearch, onUsePhoto }: {
    onSearch: (query: string, page: number) => Promise<{ photos: { id: string }[] }>;
    onUsePhoto: (photo: { id: string }) => Promise<void>;
  }) => <button onClick={async () => {
    const result = await onSearch('galaxy', 1);
    await onUsePhoto(result.photos[0]);
  }}>Choose NASA photo</button>,
}));

const wrapper = ({ children }: { children: React.ReactNode }) => <I18nProvider locale="en-US" blob={{ editor: en }}>{children}</I18nProvider>;
const response = (data: unknown) => ({ ok: true, json: async () => data });
afterEach(() => { cleanup(); fetchMock.mockReset(); });

describe('fixed remote image selection', () => {
  it('searches NASA library without an APOD key, resolves asset, saves and returns its local path', async () => {
    const select = vi.fn();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/nasa?')) return response({ photos: [{ id: 'nebula', thumb: 'thumb', nasaId: 'asset', title: 'Nebula' }] });
      if (url.startsWith('/api/nasa/asset')) return response({ imageUrl: 'full' });
      if (url === '/api/nasa') return response({ path: '/backgrounds/nasa-nebula.jpg' });
      throw Error(url);
    });
    render(<NasaBrowser hasNasaKey={false} onSelectImage={select} />, { wrapper });
    fireEvent.click(screen.getByText('Choose NASA photo'));
    await waitFor(() => expect(select).toHaveBeenCalledWith('/backgrounds/nasa-nebula.jpg'));
    expect(fetchMock).toHaveBeenCalledWith('/api/nasa', expect.objectContaining({ method: 'POST' }));
  });

  it('copies an Immich photo to the local library and returns its path', async () => {
    const select = vi.fn();
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith('/api/immich/photos?')) return response(['/api/immich/serve?assetId=abc&size=preview']);
      if (url.startsWith('/api/immich/serve')) return { ok: true, blob: async () => new Blob(['image'], { type: 'image/jpeg' }) };
      if (url === '/api/backgrounds') return response({ path: '/backgrounds/immich-abc.jpg' });
      throw Error(url);
    });
    render(<ImmichBrowser hasImmichKey onSelectImage={select} />, { wrapper });
    await waitFor(() => expect(document.querySelector('img[src*="assetId=abc"]')).not.toBeNull());
    fireEvent.click(document.querySelector('img[src*="assetId=abc"]')!.closest('button')!);
    await waitFor(() => expect(select).toHaveBeenCalledWith('/backgrounds/immich-abc.jpg'));
    expect(fetchMock).toHaveBeenCalledWith('/api/backgrounds', expect.objectContaining({ method: 'POST' }));
  });
});
