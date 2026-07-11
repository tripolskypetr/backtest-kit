// Auto-generated flag components from flagpack-core (MIT)

interface FlagProps extends React.SVGProps<SVGSVGElement> {
  width?: number | string;
  height?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

export function RussianFlag({
  width = 32,
  height = 24,
  className,
  style,
  ...props
}: FlagProps) {
  return (
    <svg width={width} height={height} className={className} style={style} {...props} viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g clipPath="url(#russian_clip027067492)">
    <rect width="32" height="24" fill="white"/>
    <path fillRule="evenodd" clipRule="evenodd" d="M0 0V24H32V0H0Z" fill="#3D58DB"/>
    <mask id="russian_mask027067492" style={{ maskType: 'luminance' }} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="24">
    <path fillRule="evenodd" clipRule="evenodd" d="M0 0V24H32V0H0Z" fill="white"/>
    </mask>
    <g mask="url(#russian_mask027067492)">
    <path fillRule="evenodd" clipRule="evenodd" d="M0 0V8H32V0H0Z" fill="#F7FCFF"/>
    <path fillRule="evenodd" clipRule="evenodd" d="M0 16V24H32V16H0Z" fill="#C51918"/>
    </g>
    </g>
    <defs>
    <clipPath id="russian_clip027067492">
    <rect width="32" height="24" fill="white"/>
    </clipPath>
    </defs>
    </svg>
  );
}

export default RussianFlag;
