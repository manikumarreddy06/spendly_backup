const fs = require('fs');
const path = 'C:/s/app/split/[id].tsx';
let f = fs.readFileSync(path, 'utf8');

// 1. Add missing styles before settledEmptyBtnTextSecondary
const insertStyles = `    liveFeedbackCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      marginBottom: 12,
    },
    liveFeedbackTitle: {
      fontSize: 13,
      fontFamily: "Inter_600SemiBold",
      marginBottom: 2,
    },
    liveFeedbackText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
    },
    allocateEqBtn: {
      backgroundColor: colors.primary + "16",
      borderWidth: 1,
      borderColor: colors.primary + "40",
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 8,
    },
    allocateEqBtnText: {
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      color: colors.primary,
    },
    settledEmptyBtnTextSecondary: `;

f = f.replace('    settledEmptyBtnTextSecondary: ', insertStyles);

// 2. Remove selectTextOnFocus from Text component
f = f.replace(
  '<Text selectTextOnFocus style={s.inviteCodeText}>{group.id}</Text>',
  '<Text style={s.inviteCodeText}>{group.id}</Text>'
);

fs.writeFileSync(path, f);
console.log('Added missing styles and fixed selectTextOnFocus');
