interface IconProps {
  className?: string;
}

const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  viewBox: "0 0 24 24",
};

export const SphereIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="6.4" />
    <ellipse cx="12" cy="12" rx="10" ry="3.4" transform="rotate(-16 12 12)" opacity="0.75" />
    <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
  </svg>
);

export const HeartIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M12 20.2S4.8 15.6 2.9 11.2A5.3 5.3 0 0 1 12 6.6a5.3 5.3 0 0 1 9.1 4.6C19.2 15.6 12 20.2 12 20.2Z" />
  </svg>
);

export const SaturnIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="5.2" />
    <path d="M4.6 15.4c-1.9-.5-3-1.3-2.8-2.2.3-1.5 4-2.4 8.9-2.4 5.2 0 9.6 1.1 9.7 2.7.1 1-1.4 1.8-3.7 2.2" opacity="0.85" />
    <path d="M7.6 16c2.7.4 6 .3 8.8-.4" opacity="0.5" />
  </svg>
);

export const FlowerIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="2.1" />
    {[0, 60, 120, 180, 240, 300].map((r) => (
      <ellipse key={r} cx="12" cy="6.8" rx="2.3" ry="3.6" transform={`rotate(${r} 12 12)`} opacity="0.8" />
    ))}
  </svg>
);

export const HelixIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M8 2.8c8.5 3.2-8.5 6.2 0 9.4s8.5 6.2 0 9.4" />
    <path d="M16 2.8c-8.5 3.2 8.5 6.2 0 9.4s-8.5 6.2 0 9.4" />
    <path d="M9.2 6.4h5.6M9.2 17.6h5.6M10 12h4" opacity="0.55" />
  </svg>
);

export const GalaxyIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M21 12a9 9 0 1 1-9-9" />
    <path d="M12 12a5 5 0 1 0 5 5" opacity="0.85" />
    <path d="M12 12a1.6 1.6 0 1 0 1.6 1.6" opacity="0.7" />
    <circle cx="19.4" cy="6.4" r="0.9" fill="currentColor" stroke="none" opacity="0.8" />
  </svg>
);

export const MicIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <rect x="9.2" y="2.8" width="5.6" height="9.4" rx="2.8" />
    <path d="M5.8 11.4a6.2 6.2 0 0 0 12.4 0" />
    <path d="M12 17.6v3.4M8.8 21h6.4" />
  </svg>
);

export const NoteIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M9.4 17.6V5.8l9.8-2.2v11.6" />
    <circle cx="6.9" cy="17.6" r="2.5" />
    <circle cx="16.7" cy="15.2" r="2.5" />
  </svg>
);

export const WaveIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 10.4v3.2M7.5 7.4v9.2M11 4.6v14.8M14.5 7.4v9.2M18 9.4v5.2M21 11.2v1.6" />
  </svg>
);

export const CaptureIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M4 8.4h2.6l1.6-2.4h7.6l1.6 2.4H20a1 1 0 0 1 1 1V18a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.4a1 1 0 0 1 1-1Z" />
    <circle cx="12" cy="13.4" r="3.4" />
  </svg>
);

export const HandIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M7.4 12.2V6.4a1.3 1.3 0 0 1 2.6 0v4.8" />
    <path d="M10 10.6V4.9a1.3 1.3 0 0 1 2.6 0v5.7" />
    <path d="M12.6 10.8V5.9a1.3 1.3 0 0 1 2.6 0v6.3" />
    <path d="M15.2 12.4V8.6a1.3 1.3 0 0 1 2.6 0v5.6c0 3.9-2.7 6.6-6.3 6.6-3 0-4.6-1.6-6.2-4.4l-1.8-3.2a1.4 1.4 0 0 1 2.3-1.6l1.6 1.8" />
  </svg>
);

export const SignalOffIcon = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <path d="M5 12.5a9.8 9.8 0 0 1 4.2-2.5M12 6.2c3.2 0 6.2 1.3 8.4 3.4" opacity="0.7" />
    <path d="M7.8 15.4a6.4 6.4 0 0 1 2.9-1.5M12 9.8c2.2 0 4.3.9 5.8 2.3" opacity="0.85" />
    <circle cx="12" cy="18" r="1.4" fill="currentColor" stroke="none" />
    <path d="M3.5 3.5l17 17" />
  </svg>
);

export const OrbitLogo = ({ className }: IconProps) => (
  <svg {...base} className={className}>
    <circle cx="12" cy="12" r="4.2" />
    <ellipse cx="12" cy="12" rx="9.6" ry="3.2" transform="rotate(-20 12 12)" opacity="0.7" />
    <circle cx="20" cy="7.6" r="1" fill="currentColor" stroke="none" />
  </svg>
);
