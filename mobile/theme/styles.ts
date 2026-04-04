import { StyleSheet } from 'react-native';
import { colors, spacing, radii, fontSize, fonts } from './tokens';

export const shared = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.s1,
    height: 44,
  },

  card: {
    backgroundColor: colors.s1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },

  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },

  mono: {
    fontFamily: fonts.code,
    fontSize: fontSize.sm,
    color: colors.t1,
  },

  monoMuted: {
    fontFamily: fonts.code,
    fontSize: fontSize.xs,
    color: colors.t4,
  },

  separator: {
    height: 1,
    backgroundColor: colors.border,
  },

  sectionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.s2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },

  sectionLabel: {
    color: colors.t4,
    fontSize: 9,
    fontWeight: '600',
    fontFamily: fonts.code,
    letterSpacing: 1.5,
  },

  badge: {
    borderRadius: radii.sm,
    paddingVertical: 2,
    paddingHorizontal: spacing.sm,
  },

  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: fonts.code,
    letterSpacing: 1,
  },

  inputField: {
    backgroundColor: colors.s2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    color: colors.t1,
    fontSize: fontSize.sm,
    fontFamily: fonts.code,
  },
});
