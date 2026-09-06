export default function Stars({ count, size = 'sm' }: { count: number; size?: 'sm' | 'lg' }) {
  return (
    <span className={`stars ${size === 'lg' ? 'lg' : ''}`} aria-label={`${count} of 3 stars`}>
      {[0, 1, 2].map((i) => (
        <svg key={i} viewBox="0 0 24 24" aria-hidden="true">
          <path
            className={i < count ? 'star-on' : 'star-off'}
            d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.5L12 17.3l-5.9 3.2 1.3-6.5L2.5 9.4l6.6-.8z"
          />
        </svg>
      ))}
    </span>
  )
}
