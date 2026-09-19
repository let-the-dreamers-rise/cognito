/**
 * Warm paper, not a control panel. A dashboard transfers anxiety; a sentence
 * resolves it, so the type is large and there is almost nothing else on screen.
 */
export const colors = {
  paper: '#FBF7F0',
  card: '#FFFFFF',
  ink: '#1F1B16',
  muted: '#7A7268',
  hairline: '#E8E0D4',
  calm: '#2E6B4F',
  checking: '#B4762A',
  quiet: '#8A8078',
};

export const space = { xs: 6, sm: 12, md: 20, lg: 32, xl: 48 };

export const type = {
  hero: { fontSize: 30, lineHeight: 40, color: colors.ink, fontWeight: '400' as const },
  title: { fontSize: 21, lineHeight: 29, color: colors.ink, fontWeight: '600' as const },
  body: { fontSize: 16, lineHeight: 25, color: colors.ink },
  small: { fontSize: 13, lineHeight: 19, color: colors.muted },
  label: {
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
    letterSpacing: 1.3,
    textTransform: 'uppercase' as const,
    fontWeight: '600' as const,
  },
};

export const statusColor = (status?: string) =>
  status === 'normal' ? colors.calm : status === 'checking' ? colors.checking : colors.quiet;
