import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    files: [
      'src/App.jsx',
      'src/components/AboutModal.jsx',
      'src/components/admin/AdminReportsTab.jsx',
      'src/components/AdminAuditTab.jsx',
      'src/components/AdminPanel.jsx',
      'src/components/AnnouncementPanel.jsx',
      'src/components/ChatWindow.jsx',
      'src/components/ClusterDetailPanel.jsx',
      'src/components/map/MapFilterSheet.jsx',
      'src/components/map/MapSearch.jsx',
      'src/components/MapPreviewCard.jsx',
      'src/components/MessageSettings.jsx',
      'src/components/ProfilePage.jsx',
      'src/hooks/useAnnounceUnread.js',
      'src/hooks/useChatFriendMeta.js',
      'src/hooks/useFriends.js',
      'src/hooks/useProfileData.js',
    ],
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: globals.serviceworker,
    },
  },
  {
    files: ['src/**/*.{test,spec}.{js,jsx}', 'src/test-setup.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.vitest,
      },
    },
  },
  {
    files: [
      'src/components/AnnouncementPanel.jsx',
      'src/components/ClusterMarkers.jsx',
      'src/contexts/FootprintActionsContext.jsx',
    ],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
