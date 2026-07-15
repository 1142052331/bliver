export interface RouteMetadata { readonly title: string; readonly auth: 'public' | 'required'; }
export const routeMetadata = {
  '/map': { title: 'Map', auth: 'public' },
  '/activity': { title: 'Activity', auth: 'public' },
  '/people': { title: 'People', auth: 'required' },
  '/messages': { title: 'Messages', auth: 'required' },
  '/me': { title: 'My space', auth: 'required' },
  '/profile/:userId': { title: 'Profile', auth: 'public' },
  '/footprints/:footprintId': { title: 'Footprint', auth: 'public' },
  '/admin': { title: 'Admin', auth: 'required' },
} as const satisfies Record<string, RouteMetadata>;
