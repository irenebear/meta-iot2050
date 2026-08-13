import { createTheme } from '@mui/material/styles';

const light = {
  background: '#f4f6f7',
  surface: '#ffffff',
  text: '#172025',
  muted: '#526169',
  border: '#d6dfe2'
};

const dark = {
  background: '#15191c',
  surface: '#242a2e',
  text: '#edf3f4',
  muted: '#b7c1c5',
  border: '#465158'
};

export default function createAppTheme (mode = 'light') {
  const colors = mode === 'dark' ? dark : light;
  return createTheme({
    palette: {
      mode,
      primary: { light: '#d6f0f0', main: '#009999', dark: '#007f7f', contrastText: '#fff' },
      background: { default: colors.background, paper: colors.surface },
      text: { primary: colors.text, secondary: colors.muted },
      divider: colors.border
    },
    typography: { fontFamily: 'Siemens Sans, Arial, sans-serif' },
    components: {
      MuiCssBaseline: {
        styleOverrides: { body: { backgroundColor: colors.background, color: colors.text } }
      },
      MuiAlert: {
        styleOverrides: { root: { borderRadius: 6 } }
      },
      MuiButton: {
        styleOverrides: { root: { borderRadius: 6, textTransform: 'none', boxShadow: 'none', fontWeight: 600 } }
      },
      MuiPaper: {
        styleOverrides: { root: { backgroundColor: colors.surface, border: `1px solid ${colors.border}`, borderRadius: 6, boxShadow: '0 4px 16px rgba(20,45,55,.08)' } }
      },
      MuiAppBar: {
        styleOverrides: { root: { backgroundColor: '#009999', color: '#fff' } }
      },
      MuiContainer: {
        styleOverrides: { root: { backgroundColor: 'transparent' } }
      }
    }
  });
}
