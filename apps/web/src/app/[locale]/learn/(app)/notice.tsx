'use client';

import { useState } from 'react';

/** An announcement banner the student can close (FR-205). */
export function Notice({
  title,
  body,
  closeLabel,
}: {
  title: string;
  body: string;
  closeLabel: string;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <aside className="notice" role="note">
      <div>
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
      <button type="button" className="link-button" onClick={() => setOpen(false)}>
        {closeLabel}
      </button>
    </aside>
  );
}
