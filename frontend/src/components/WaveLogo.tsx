export default function WaveLogo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="RecurrSens">
      <defs>
        <radialGradient id="bSB" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#5ff0e8" stopOpacity="0.42" />
          <stop offset="55%" stopColor="#1ec8c8" stopOpacity="0.14" />
          <stop offset="100%" stopColor="#1ec8c8" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tSB" x1="12" y1="0" x2="12" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a0fdf8" />
          <stop offset="100%" stopColor="#17b8c0" />
        </linearGradient>
        <filter id="gSB" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="0.65" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <ellipse cx="12" cy="12" rx="11" ry="11" fill="url(#bSB)" />
      <path
        d="M17,10V6a2,2,0,0,0-2.109-2A2.118,2.118,0,0,0,13,6.17V18a4.017,4.017,0,0,1-1.246,2.9A3.968,3.968,0,0,1,9,22c-.071,0-.143,0-.215,0A4.089,4.089,0,0,1,5,17.83V14a1,1,0,0,0-1-1H3a1,1,0,0,1,0-2H4a3,3,0,0,1,3,3v3.83A2.118,2.118,0,0,0,8.891,20,2,2,0,0,0,11,18V6.17a4.089,4.089,0,0,1,3.787-4.165A4,4,0,0,1,19,6v4a1,1,0,0,0,1,1h1a1,1,0,0,1,0,2H20A3,3,0,0,1,17,10Z"
        fill="url(#tSB)"
        filter="url(#gSB)"
      />
    </svg>
  );
}
