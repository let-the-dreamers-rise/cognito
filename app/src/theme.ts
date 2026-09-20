/**
 * Warm paper, not a control panel. A dashboard transfers anxiety; a sentence
 * resolves it, so the type is large and there is almost nothing else on screen.
 *
 * The one deliberate decision here: the daily sentence is set in an old-style
 * serif, because it should read like a note someone left you rather than a
 * readout from a machine. Everything functional is set in a neutral sans, so
 * the serif only ever appears on the thing that matters.
 */
export const colors = {
  paper: '#FBF7F0',
  card: '#FFFFFF',
  ink: '#1F1B16',
  muted: '#7A7268',
  hairline: '#E8E0D4',
  calm: '#2E6B4F',
  checking: '#B4762A',
  critical: '#A32020',
  quiet: '#8A8078',
};

export const fonts = {
  serif: 'Fraunces_400Regular',
  serifStrong: 'Fraunces_600SemiBold',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansStrong: 'Inter_600SemiBold',
};

export const space = { xs: 6, sm: 12, md: 20, lg: 32, xl: 48 };

export const type = {
  hero: {
    fontFamily: fonts.serif,
    fontSize: 31,
    lineHeight: 42,
    color: colors.ink,
    letterSpacing: -0.3,
  },
  title: { fontFamily: fonts.sansStrong, fontSize: 20, lineHeight: 28, color: colors.ink },
  body: { fontFamily: fonts.sans, fontSize: 16, lineHeight: 25, color: colors.ink },
  small: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, color: colors.muted },
  label: {
    fontFamily: fonts.sansStrong,
    fontSize: 11,
    lineHeight: 15,
    color: colors.muted,
    letterSpacing: 1.4,
    textTransform: 'uppercase' as const,
  },
};

export const statusColor = (status?: string) => {
  if (status === 'normal') return colors.calm;
  if (status === 'critical') return colors.critical;
  if (status === 'checking') return colors.checking;
  return colors.quiet;
};
