'use client';

import { useEffect, useId, useRef, useState, type ClipboardEvent, type DragEvent } from 'react';
import { CloseIcon, ImageIcon, MonitorIcon, PhoneIcon } from './icons';
import { Modal } from './modal';
import { TagInput } from './tag-input';
import { useToast } from './toast';
import { Button, Field, IconButton, Segmented, Select, TextArea, TextInput } from './ui';
import { useDebounced, useObjectUrl } from '@/lib/hooks';
import { previewStyle, useFont } from '@/lib/fonts';
import { isImageFile } from '@/lib/image';
import { addShots, addSite, type ShotInput } from '@/lib/store';
import {
  INDUSTRIES,
  SECTIONS,
  SOURCES,
  industryLabel,
  sectionLabel,
  type Device,
  type Industry,
  type Section,
  type Site,
  type Source,
} from '@/lib/types';
import { normalizeUrl, plural, siteNameFromUrl, uid } from '@/lib/utils';

interface PageMeta {
  title?: string;
  description?: string;
  siteName?: string;
  image?: string;
}

interface Pending {
  id: string;
  file: File;
  section: Section | '';
  device: Device;
  note: string;
}

interface AddSiteModalProps {
  open: boolean;
  onClose: () => void;
  /** When set, the flow only adds screenshots to this site. */
  site?: Site | null;
  /** Prefilled by pasting a link or images in, or by the bookmarklet. */
  initialUrl?: string;
  initialName?: string;
  initialFiles?: File[];
  fontSuggestions: string[];
  styleSuggestions: string[];
}

export function AddSiteModal(props: AddSiteModalProps) {
  // Mounted fresh every time it opens, so there is no state to reset.
  if (!props.open) return null;
  return <AddForm {...props} />;
}

function AddForm({
  open,
  onClose,
  site = null,
  initialUrl,
  initialName,
  initialFiles,
  fontSuggestions,
  styleSuggestions,
}: AddSiteModalProps) {
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [url, setUrl] = useState(initialUrl ?? '');
  const [nameDraft, setNameDraft] = useState<string | null>(initialName ?? null);
  const [source, setSource] = useState<Source>('Awwwards');
  const [sourceUrl, setSourceUrl] = useState('');
  const [designer, setDesigner] = useState('');
  const [industry, setIndustry] = useState<Industry>('other');
  const [styles, setStyles] = useState<string[]>([]);
  const [heading, setHeading] = useState('');
  const [body, setBody] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<Pending[]>(() =>
    (initialFiles ?? []).map((file) => ({
      id: uid(),
      file,
      section: '' as const,
      device: 'desktop' as Device,
      note: '',
    })),
  );
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [takingPreview, setTakingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What the page at that address says about itself, once it has been read.
  const settledUrl = useDebounced(url.trim(), 600);
  const [lookup, setLookup] = useState<{ url: string; data: PageMeta | null } | null>(null);
  const looksLikeUrl = /^(https?:\/\/\S+|[\w-]+(\.[\w-]+)+(\/\S*)?)$/i.test(settledUrl);
  const reading = Boolean(site) === false && looksLikeUrl && lookup?.url !== settledUrl;
  const meta = lookup?.url === settledUrl ? lookup.data : null;

  useEffect(() => {
    if (site || !looksLikeUrl) return;
    const target = normalizeUrl(settledUrl);
    let active = true;
    void fetch(`/api/meta?url=${encodeURIComponent(target)}`)
      .then((response) => (response.ok ? (response.json() as Promise<PageMeta>) : null))
      .catch(() => null)
      .then((data) => {
        if (active) setLookup({ url: settledUrl, data });
      });
    return () => {
      active = false;
    };
  }, [settledUrl, looksLikeUrl, site]);

  // The name follows the page's own title, then the address, until it is edited.
  const name = nameDraft ?? meta?.title ?? siteNameFromUrl(url);

  const takePreviewImage = async () => {
    if (!meta?.image || takingPreview) return;
    setTakingPreview(true);
    try {
      const response = await fetch(`/api/meta?image=${encodeURIComponent(meta.image)}`);
      if (!response.ok) throw new Error('no');
      const blob = await response.blob();
      addFiles([new File([blob], 'preview', { type: blob.type })]);
    } catch {
      setError('That preview image could not be fetched.');
    } finally {
      setTakingPreview(false);
    }
  };

  const addFiles = (files: Iterable<File>) => {
    const images = [...files].filter(isImageFile);
    if (!images.length) return;
    setItems((prev) => [
      ...prev,
      ...images.map((file) => ({
        id: uid(),
        file,
        section: '' as const,
        device: 'desktop' as Device,
        note: '',
      })),
    ]);
    setError(null);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  };

  const onPaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (event.clipboardData.files.length) addFiles(event.clipboardData.files);
  };

  const patch = (id: string, change: Partial<Pending>) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...change } : item)));
  };

  const canSave = site ? items.length > 0 : url.trim().length > 0 || items.length > 0;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setError(null);
    const shots: ShotInput[] = items.map((item) => ({
      section: item.section || null,
      device: item.device,
      note: item.note,
      file: item.file,
    }));
    try {
      if (site) {
        await addShots(site.id, shots);
        toast(`${plural(shots.length, 'shot')} added`);
      } else {
        // A site saved with no screenshots still gets one empty shot, so it
        // appears on the wall as a placeholder to fill in later.
        await addSite(
          {
            name: name.trim() || siteNameFromUrl(url) || 'Untitled',
            url: url.trim() ? normalizeUrl(url) : undefined,
            sourceUrl: sourceUrl.trim() ? normalizeUrl(sourceUrl) : undefined,
            source,
            designer,
            industry,
            styles,
            fonts: { heading, body },
            colors: [],
            notes,
          },
          shots.length ? shots : [{ section: null, device: 'desktop', note: '' }],
        );
        toast('Site added');
      }
      onClose();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'That could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={site ? `Add screenshots to ${site.name}` : 'Add site'}
      className="sm:max-w-2xl"
      footer={
        <>
          <span className="mr-auto text-13 text-muted">
            {site ? 'One image is enough.' : 'An address or one image is enough.'}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={() => void save()} disabled={!canSave || saving}>
            {saving ? 'Saving' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6" onPaste={onPaste}>
        {site ? null : (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Site address">
              <TextInput
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="hotelname.com"
                inputMode="url"
                autoFocus
              />
            </Field>
            <Field label="Name" hint={reading ? 'Reading the page…' : undefined}>
              <TextInput
                value={name}
                onChange={(event) => setNameDraft(event.target.value)}
                placeholder="Fills in from the page"
              />
            </Field>
          </div>
        )}

        <section className="flex flex-col gap-3">
          <h3 className="text-13 text-muted">Screenshots</h3>
          <div
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center gap-2 rounded-[6px] border border-dashed p-6 text-center transition-colors duration-150 motion-ease ${
              dragging ? 'border-accent' : 'border-hairline'
            }`}
          >
            <ImageIcon className="text-muted" width={20} height={20} />
            <p className="text-13 text-muted">Drop images here, or paste</p>
            <Button onClick={() => fileInput.current?.click()}>Choose files</Button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) addFiles(event.target.files);
                event.target.value = '';
              }}
            />
          </div>

          {meta?.image && !items.length ? (
            <div className="flex items-center gap-3 rounded-[6px] border border-hairline bg-surface p-2">
              <img
                src={`/api/meta?image=${encodeURIComponent(meta.image)}`}
                alt=""
                className="h-12 w-20 shrink-0 rounded-[4px] border border-hairline object-cover"
              />
              <p className="min-w-0 flex-1 text-13 text-muted">That page offers a preview image.</p>
              <Button onClick={() => void takePreviewImage()} disabled={takingPreview}>
                {takingPreview ? 'Fetching' : 'Use it'}
              </Button>
            </div>
          ) : null}

          {items.map((item) => (
            <PendingRow
              key={item.id}
              item={item}
              onChange={(change) => patch(item.id, change)}
              onRemove={() => setItems((prev) => prev.filter((entry) => entry.id !== item.id))}
            />
          ))}
        </section>

        {site ? null : (
          <section className="flex flex-col gap-3">
            <h3 className="text-13 text-muted">Details</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Industry">
                <Select
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value as Industry)}
                >
                  {INDUSTRIES.map((value) => (
                    <option key={value} value={value}>
                      {industryLabel(value)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Source">
                <Select value={source} onChange={(event) => setSource(event.target.value as Source)}>
                  {SOURCES.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Designer">
                <TextInput
                  value={designer}
                  onChange={(event) => setDesigner(event.target.value)}
                  placeholder="Studio or person"
                />
              </Field>
              <Field label="Found at">
                <TextInput
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  placeholder="Awwwards or Dribbble link"
                  inputMode="url"
                />
              </Field>
              <Suggest
                label="Heading font"
                value={heading}
                onChange={setHeading}
                suggestions={fontSuggestions}
              />
              <Suggest
                label="Body font"
                value={body}
                onChange={setBody}
                suggestions={fontSuggestions}
              />
            </div>
            <Field label="Styles">
              <TagInput values={styles} onChange={setStyles} suggestions={styleSuggestions} />
            </Field>
            <Field label="Notes">
              <TextArea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Why you saved it, what you would reuse"
                rows={3}
              />
            </Field>
          </section>
        )}

        {error ? <p className="text-13">{error}</p> : null}
      </div>
    </Modal>
  );
}

function PendingRow({
  item,
  onChange,
  onRemove,
}: {
  item: Pending;
  onChange: (change: Partial<Pending>) => void;
  onRemove: () => void;
}) {
  const thumb = useObjectUrl(item.file);
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-[6px] border border-hairline bg-surface p-2">
      {thumb ? (
        <img
          src={thumb}
          alt=""
          className="h-16 w-24 shrink-0 rounded-[4px] border border-hairline object-cover"
        />
      ) : (
        <div className="h-16 w-24 shrink-0 rounded-[4px] border border-hairline" />
      )}
      <div className="flex min-w-50 flex-1 flex-col gap-2">
        <div className="flex items-center gap-2">
          <Select
            aria-label="Section"
            value={item.section}
            onChange={(event) => onChange({ section: event.target.value as Section | '' })}
            className="flex-1"
          >
            <option value="">Unsorted</option>
            {SECTIONS.map((section) => (
              <option key={section} value={section}>
                {sectionLabel(section)}
              </option>
            ))}
          </Select>
          <Segmented
            label="Device"
            value={item.device}
            onChange={(device) => onChange({ device })}
            options={[
              { value: 'desktop', label: 'Desktop', icon: <MonitorIcon /> },
              { value: 'mobile', label: 'Mobile', icon: <PhoneIcon /> },
            ]}
          />
          <IconButton label="Remove this image" onClick={onRemove}>
            <CloseIcon />
          </IconButton>
        </div>
        <TextInput
          value={item.note}
          onChange={(event) => onChange({ note: event.target.value })}
          placeholder="Note (optional)"
          aria-label="Note"
        />
      </div>
    </div>
  );
}

function Suggest({
  label,
  value,
  onChange,
  suggestions,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
}) {
  const listId = useId();
  // Wait for the typing to settle before going looking for the typeface.
  const settled = useDebounced(value.trim(), 400);
  const { family } = useFont(settled);
  return (
    <Field label={label}>
      <>
        <TextInput
          value={value}
          onChange={(event) => onChange(event.target.value)}
          list={suggestions.length ? listId : undefined}
          placeholder="Typeface name"
          style={value.trim() === settled ? previewStyle(family) : undefined}
        />
        {suggestions.length ? (
          <datalist id={listId}>
            {suggestions.map((item) => (
              <option key={item} value={item} />
            ))}
          </datalist>
        ) : null}
      </>
    </Field>
  );
}
