import type { SVGProps } from 'react';

/**
 * Ícones em SVG inline. Um único traço, mesma grade de 24px e mesma espessura
 * em todos — consistência visual sem depender de biblioteca externa.
 */

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconDashboard = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7.5" height="9" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="5.5" rx="1.5" />
    <rect x="13.5" y="12" width="7.5" height="9" rx="1.5" />
    <rect x="3" y="15.5" width="7.5" height="5.5" rx="1.5" />
  </Icon>
);

export const IconEntries = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h11M4 12h7M4 18h9" />
    <path d="M17 15v6M14 18h6" />
  </Icon>
);

export const IconTarget = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </Icon>
);

export const IconHistory = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3 4v4.5h4.5" />
    <path d="M12 7.5V12l3 1.8" />
  </Icon>
);

export const IconUsers = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="8" r="3.25" />
    <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
    <path d="M16 5.5a3.25 3.25 0 0 1 0 6.2" />
    <path d="M17.5 14.2a5.5 5.5 0 0 1 3 5.3" />
  </Icon>
);

export const IconTransfer = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8h13l-3.2-3.2" />
    <path d="M20 16H7l3.2 3.2" />
  </Icon>
);

export const IconChart = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20V10" />
    <path d="M10 20V4" />
    <path d="M16 20v-7" />
    <path d="M21.5 20h-19" />
  </Icon>
);

export const IconClosing = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 2.5h8l5 5V21a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1Z" />
    <path d="M14 2.5V8h5" />
    <path d="M8.5 15l2.2 2.2 4.3-4.4" />
  </Icon>
);

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-1 1.47V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.77.32l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.32-1.77l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.6 1.6 0 0 0 9 4.6a1.6 1.6 0 0 0 1-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.6 1.6 0 0 0-.32 1.77V9a1.6 1.6 0 0 0 1.47 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z" />
  </Icon>
);

export const IconAudit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 3.5h11l3.5 3.5v13.5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z" />
    <path d="M8 9h8M8 13h8M8 17h5" />
  </Icon>
);

export const IconLogout = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4" />
    <path d="M9.5 8.5 6 12l3.5 3.5" />
    <path d="M6 12h9" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconSearch = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4.5 4.5" />
  </Icon>
);

export const IconFilter = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 5.5h17l-6.6 7.6V19l-3.8 2v-7.9L3.5 5.5Z" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Icon>
);

export const IconAlert = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9.5v4M12 17h.01" />
  </Icon>
);

export const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);

export const IconShield = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2.8 4.5 6v6c0 4.5 3.1 8.3 7.5 9.4 4.4-1.1 7.5-4.9 7.5-9.4V6L12 2.8Z" />
    <path d="M12 9v4M12 16h.01" />
  </Icon>
);

export const IconChevronDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 9.5 6 6 6-6" />
  </Icon>
);

export const IconChevronLeft = (p: IconProps) => (
  <Icon {...p}>
    <path d="m14.5 6-6 6 6 6" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="m9.5 6 6 6-6 6" />
  </Icon>
);

export const IconTrendUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 16.5 9.5 10l4 4 7-7.5" />
    <path d="M15.5 6.5h5v5" />
  </Icon>
);

export const IconTrendDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7.5 9.5 14l4-4 7 7.5" />
    <path d="M15.5 17.5h5v-5" />
  </Icon>
);

export const IconWallet = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 7.5A2 2 0 0 1 5.5 5.5h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-12a2 2 0 0 1-2-2v-9Z" />
    <path d="M16 12h4.5" />
    <path d="M3.5 9.5h16" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 6.5h15" />
    <path d="M9 6.5V4.8a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1.7" />
    <path d="M6.5 6.5 7.4 20a1 1 0 0 0 1 .9h7.2a1 1 0 0 0 1-.9l.9-13.5" />
    <path d="M10.5 11v5.5M13.5 11v5.5" />
  </Icon>
);

export const IconEdit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="m14.5 5.5 3 3" />
  </Icon>
);

export const IconCalendar = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="5" width="17" height="16" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Icon>
);

export const IconMenu = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Icon>
);

export const IconSpinner = (p: IconProps) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    width="1em"
    height="1em"
    className="animate-spin"
    aria-hidden="true"
    {...p}
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
    <path
      d="M21 12a9 9 0 0 0-9-9"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    />
  </svg>
);

export const IconInbox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 13.5h4l1.5 3h6l1.5-3h4" />
    <path d="M5.6 5.2h12.8a1 1 0 0 1 .94.66l2.16 6.1a1 1 0 0 1 .06.33V19a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-6.7a1 1 0 0 1 .06-.34l2.16-6.1a1 1 0 0 1 .94-.66Z" />
  </Icon>
);

export const IconUnlock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 7.5-2" />
  </Icon>
);

export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
    <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
  </Icon>
);

/** Dicas: bola de futebol simplificada (pentágono central + gomos). */
export const IconTips = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="8.75" />
    <path d="m12 7.2 3.4 2.5-1.3 4h-4.2l-1.3-4L12 7.2Z" />
    <path d="M12 7.2V3.5M15.4 9.7l3.3-1.4M14.1 13.7l2.2 3.2M9.9 13.7l-2.2 3.2M8.6 9.7 5.3 8.3" />
  </Icon>
);

/** Bilhetes: cupom com picote. */
export const IconTicket = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 8.5v-2a1 1 0 0 1 1-1h15a1 1 0 0 1 1 1v2a2 2 0 0 0 0 4v2a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-2a2 2 0 0 0 0-4Z" />
    <path d="M14.5 5.5v13" strokeDasharray="2 2" />
  </Icon>
);

export const IconFlame = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.5c.6 3 3.4 4.3 3.4 8a3.4 3.4 0 0 1-6.8 0c0-1.2.4-2.1.9-2.8.2 1.1.9 1.8 1.6 1.8.9 0 1.3-.9.9-2.2-.5-1.6-.6-3.2 0-4.8Z" />
    <path d="M6.5 13.5a5.5 5.5 0 1 0 11 0c0-1.6-.6-3-1.5-4.3" />
  </Icon>
);

export const IconRefresh = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 12a8 8 0 1 1-2.3-5.6" />
    <path d="M20 4v4.5h-4.5" />
  </Icon>
);

export const IconMore = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="5" cy="12" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.35" fill="currentColor" stroke="none" />
    <circle cx="19" cy="12" r="1.35" fill="currentColor" stroke="none" />
  </Icon>
);
