import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { LoginRequest, RegisterRequest } from '@bliver/contracts';
import { authApi } from './api.js';
import { sessionQueryKey } from './queries.js';

export function useLoginCommand() { const client = useQueryClient(); return useMutation({ mutationFn: (input: LoginRequest) => authApi.login(input), onSuccess: () => { void client.invalidateQueries({ queryKey: sessionQueryKey }); } }); }
export function useRegisterCommand() { return useMutation({ mutationFn: (input: RegisterRequest) => authApi.register(input) }); }
export function useLogoutCommand() { const client = useQueryClient(); return useMutation({ mutationFn: authApi.logout, onSuccess: () => { client.removeQueries({ queryKey: sessionQueryKey }); } }); }
