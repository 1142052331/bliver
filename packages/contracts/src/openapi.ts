import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from '@asteasolutions/zod-to-openapi';

import { problemDetails } from './errors.js';
import { healthResponse } from './health.js';
import { authResponse, loginRequest, publicUser, registerRequest, refreshRequest } from './auth.js';
import { sessionDto, sessionListResponse } from './session.js';
import { activityPageDto, activityQuery, addCommentInput, addReactionInput, commentsResponse, createReportInput, footprintDto, footprintRecordResponse, mapFootprintsResponse, publishFootprintRequest, publishFootprintResponse, reactionDto, reportCreatedResponse, updateFootprintVisibilityRequest } from './footprints.js';
import { mediaCompleteRequest, mediaSignatureRequest, mediaSignatureResponse } from './media.js';
import { locationResolveRequest, locationResolveResponse, mapFootprintQuery, placeSearchResponse } from './geography.js';
import { blockDto, friendshipDto, friendshipListItemDto, friendshipRequestDto, relationshipSummaryDto, requestFriendshipInput, socialUserId } from './social.js';
import { z } from './zod.js';

export function buildOpenApiDocument() {
  const registry = new OpenAPIRegistry();
  const healthSchema = registry.register('HealthResponse', healthResponse);
  const problemSchema = registry.register('ProblemDetails', problemDetails);
  const userSchema = registry.register('PublicUser', publicUser);
  const registerSchema = registry.register('RegisterRequest', registerRequest);
  const loginSchema = registry.register('LoginRequest', loginRequest);
  const refreshSchema = registry.register('RefreshRequest', refreshRequest);
  const authSchema = registry.register('AuthResponse', authResponse);
  const sessionSchema = registry.register('Session', sessionDto);
  const sessionsSchema = registry.register('SessionListResponse', sessionListResponse);
  const footprintSchema = registry.register('Footprint', footprintDto);
  const footprintRecordSchema = registry.register('FootprintRecordResponse', footprintRecordResponse);
  const mapSchema = registry.register('MapFootprintsResponse', mapFootprintsResponse);
  const mediaRequestSchema = registry.register('MediaSignatureRequest', mediaSignatureRequest);
  const mediaSchema = registry.register('MediaSignatureResponse', mediaSignatureResponse);
  const mediaCompleteSchema = registry.register('MediaCompleteRequest', mediaCompleteRequest);
  const publishSchema = registry.register('PublishFootprintRequest', publishFootprintRequest);
  const publishResponseSchema = registry.register('PublishFootprintResponse', publishFootprintResponse);
  const visibilitySchema = registry.register('UpdateFootprintVisibilityRequest', updateFootprintVisibilityRequest);
  const placeSearchResponseSchema = registry.register('PlaceSearchResponse', placeSearchResponse);
  const locationResolveRequestSchema = registry.register('LocationResolveRequest', locationResolveRequest);
  const locationResolveResponseSchema = registry.register('LocationResolveResponse', locationResolveResponse);
  const activityPageSchema = registry.register('ActivityPage', activityPageDto);
  const addReactionSchema = registry.register('AddReactionRequest', addReactionInput);
  const reactionSchema = registry.register('Reaction', reactionDto);
  const addCommentSchema = registry.register('AddCommentRequest', addCommentInput.omit({ footprintId: true }));
  const commentsSchema = registry.register('CommentsResponse', commentsResponse);
  const reportSchema = registry.register('CreateReportRequest', createReportInput);
  const reportResponseSchema = registry.register('ReportCreatedResponse', reportCreatedResponse);
  const friendshipSchema = registry.register('Friendship', friendshipDto);
  const friendshipRequestSchema = registry.register('FriendshipRequest', friendshipRequestDto);
  const friendshipListItemSchema = registry.register('FriendshipListItem', friendshipListItemDto);
  const relationshipSummarySchema = registry.register('RelationshipSummary', relationshipSummaryDto);
  const blockSchema = registry.register('Block', blockDto);
  const requestFriendshipSchema = registry.register('RequestFriendship', requestFriendshipInput);
  const mediaAssetParams = z.object({ assetId: z.string().uuid() });
  const footprintParams = z.object({ footprintId: z.string().uuid() });
  const footprintCommentParams = z.object({ footprintId: z.string().uuid(), commentId: z.string().uuid() });
  const commentParams = z.object({ commentId: z.string().uuid() });
  const placeSearchQuery = z.object({ q: z.string().trim().min(1).max(120) });
  const userParams = z.object({ userId: socialUserId });
  const friendshipParams = z.object({ friendshipId: z.string().uuid() });

  for (const path of ['/healthz', '/versionz'] as const) {
    registry.registerPath({
      method: 'get',
      path,
      responses: {
        200: {
          description: 'The service is healthy',
          content: {
            'application/json': { schema: healthSchema },
          },
        },
      },
    });
  }

  registry.registerPath({
    method: 'get',
    path: '/readyz',
    responses: {
      200: {
        description: 'The service is ready',
        content: {
          'application/json': { schema: healthSchema },
        },
      },
      503: {
        description: 'The database is unavailable',
        content: {
          'application/problem+json': { schema: problemSchema },
        },
      },
    },
  });

  registry.registerPath({ method: 'post', path: '/api/v1/auth/register', request: { body: { content: { 'application/json': { schema: registerSchema } } } }, responses: { 201: { description: 'Registered', content: { 'application/json': { schema: authSchema } } }, 400: { description: 'Invalid input', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/auth/login', request: { body: { content: { 'application/json': { schema: loginSchema } } } }, responses: { 200: { description: 'Authenticated', content: { 'application/json': { schema: authSchema } } }, 401: { description: 'Invalid credentials', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/auth/refresh', request: { body: { content: { 'application/json': { schema: refreshSchema } } } }, responses: { 200: { description: 'Rotated credentials', content: { 'application/json': { schema: authSchema } } }, 401: { description: 'Invalid refresh token', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/auth/logout', responses: { 204: { description: 'Signed out' } } });
  registry.registerPath({ method: 'get', path: '/api/v1/session', responses: { 200: { description: 'Current session', content: { 'application/json': { schema: sessionSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/users/me', responses: { 200: { description: 'Current user', content: { 'application/json': { schema: userSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/sessions', responses: { 200: { description: 'Sessions', content: { 'application/json': { schema: sessionsSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/media/signature', request: { body: { content: { 'application/json': { schema: mediaRequestSchema } } } }, responses: { 200: { description: 'Signed upload parameters', content: { 'application/json': { schema: mediaSchema } } } } });
  registry.registerPath({ method: 'delete', path: '/api/v1/media/{assetId}', request: { params: mediaAssetParams }, responses: { 204: { description: 'Media asset deleted' }, 401: { description: 'Authentication required', content: { 'application/problem+json': { schema: problemSchema } } }, 404: { description: 'Media asset not found', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/media/{assetId}/complete', request: { params: mediaAssetParams, body: { content: { 'application/json': { schema: mediaCompleteSchema } } } }, responses: { 204: { description: 'Media metadata reconciled' }, 400: { description: 'Invalid metadata', content: { 'application/problem+json': { schema: problemSchema } } }, 401: { description: 'Authentication required', content: { 'application/problem+json': { schema: problemSchema } } }, 404: { description: 'Media asset not found', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/footprints/{footprintId}', request: { params: footprintParams }, responses: { 200: { description: 'Footprint detail', content: { 'application/json': { schema: footprintSchema } } }, 404: { description: 'Footprint not found', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/footprints', request: { body: { content: { 'application/json': { schema: publishSchema } } } }, responses: { 201: { description: 'Published footprint and outbox event', content: { 'application/json': { schema: publishResponseSchema } } }, 400: { description: 'Invalid publish request', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'patch', path: '/api/v1/footprints/{footprintId}/visibility', request: { params: footprintParams, body: { content: { 'application/json': { schema: visibilitySchema } } } }, responses: { 200: { description: 'Updated footprint visibility', content: { 'application/json': { schema: footprintRecordSchema } } }, 400: { description: 'Invalid visibility', content: { 'application/problem+json': { schema: problemSchema } } }, 409: { description: 'Footprint conflict', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'delete', path: '/api/v1/footprints/{footprintId}', request: { params: footprintParams }, responses: { 204: { description: 'Footprint deleted' }, 409: { description: 'Footprint conflict', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/places/search', request: { query: placeSearchQuery }, responses: { 200: { description: 'Place search results', content: { 'application/json': { schema: placeSearchResponseSchema } } }, 400: { description: 'Invalid place query', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/location/resolve', request: { body: { content: { 'application/json': { schema: locationResolveRequestSchema } } } }, responses: { 200: { description: 'Resolved place and weather', content: { 'application/json': { schema: locationResolveResponseSchema } } }, 400: { description: 'Invalid location', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/map/footprints', request: { query: mapFootprintQuery }, responses: { 200: { description: 'Map footprints', content: { 'application/json': { schema: mapSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/discovery/map', request: { query: mapFootprintQuery }, responses: { 200: { description: 'Privacy-filtered map discovery', content: { 'application/json': { schema: mapSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/activity', request: { query: activityQuery }, responses: { 200: { description: 'Reverse chronological activity', content: { 'application/json': { schema: activityPageSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/footprints/{footprintId}/reactions', request: { params: footprintParams }, responses: { 200: { description: 'Footprint reactions', content: { 'application/json': { schema: z.object({ items: z.array(reactionSchema) }) } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/footprints/{footprintId}/reactions', request: { params: footprintParams, body: { content: { 'application/json': { schema: addReactionSchema } } } }, responses: { 200: { description: 'Reaction added or replaced', content: { 'application/json': { schema: reactionSchema } } }, 401: { description: 'Authentication required', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'delete', path: '/api/v1/footprints/{footprintId}/reactions', request: { params: footprintParams }, responses: { 204: { description: 'Reaction removed' }, 401: { description: 'Authentication required', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/footprints/{footprintId}/comments', request: { params: footprintParams }, responses: { 200: { description: 'Two-level conversation', content: { 'application/json': { schema: commentsSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/footprints/{footprintId}/comments', request: { params: footprintParams, body: { content: { 'application/json': { schema: addCommentSchema } } } }, responses: { 201: { description: 'Comment added' }, 401: { description: 'Authentication required', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/footprints/{footprintId}/comments/{commentId}/replies', request: { params: footprintCommentParams, body: { content: { 'application/json': { schema: addCommentSchema.omit({ parentCommentId: true }) } } } }, responses: { 201: { description: 'Reply added' }, 400: { description: 'Invalid parent comment', content: { 'application/problem+json': { schema: problemSchema } } }, 401: { description: 'Authentication required', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'delete', path: '/api/v1/comments/{commentId}', request: { params: commentParams }, responses: { 204: { description: 'Comment deleted' }, 403: { description: 'Comment deletion forbidden', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/reports', request: { body: { content: { 'application/json': { schema: reportSchema } } } }, responses: { 201: { description: 'Report intake created', content: { 'application/json': { schema: reportResponseSchema } } }, 409: { description: 'Duplicate open report', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/friendships', responses: { 200: { description: 'Accepted friendships', content: { 'application/json': { schema: z.object({ items: z.array(friendshipListItemSchema) }) } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/friendships', request: { body: { content: { 'application/json': { schema: requestFriendshipSchema } } } }, responses: { 201: { description: 'Friendship requested', content: { 'application/json': { schema: friendshipSchema } } }, 404: { description: 'Blocked relationship is hidden', content: { 'application/problem+json': { schema: problemSchema } } }, 409: { description: 'Invalid transition or idempotency conflict', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/friendships/requests', responses: { 200: { description: 'Incoming and outgoing friendship requests', content: { 'application/json': { schema: z.object({ incoming: z.array(friendshipRequestSchema), outgoing: z.array(friendshipRequestSchema) }) } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/friendships/{friendshipId}/accept', request: { params: friendshipParams }, responses: { 200: { description: 'Friendship accepted', content: { 'application/json': { schema: friendshipSchema } } }, 404: { description: 'Request not found', content: { 'application/problem+json': { schema: problemSchema } } }, 409: { description: 'Invalid transition or idempotency conflict', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'post', path: '/api/v1/friendships/{friendshipId}/reject', request: { params: friendshipParams }, responses: { 200: { description: 'Friendship rejected', content: { 'application/json': { schema: friendshipSchema } } }, 404: { description: 'Request not found', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'delete', path: '/api/v1/friendships/{userId}', request: { params: userParams }, responses: { 204: { description: 'Friendship removed' }, 409: { description: 'Invalid transition', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/relationships/{userId}', request: { params: userParams }, responses: { 200: { description: 'Relationship summary', content: { 'application/json': { schema: relationshipSummarySchema } } }, 404: { description: 'Blocked relationship is hidden', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'get', path: '/api/v1/blocks', responses: { 200: { description: 'Users blocked by the actor', content: { 'application/json': { schema: z.object({ items: z.array(blockSchema) }) } } } } });
  registry.registerPath({ method: 'put', path: '/api/v1/blocks/{userId}', request: { params: userParams }, responses: { 200: { description: 'User blocked', content: { 'application/json': { schema: blockSchema } } }, 409: { description: 'Invalid relationship', content: { 'application/problem+json': { schema: problemSchema } } } } });
  registry.registerPath({ method: 'delete', path: '/api/v1/blocks/{userId}', request: { params: userParams }, responses: { 204: { description: 'User unblocked' } } });

  return new OpenApiGeneratorV31(registry.definitions).generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Bliver V2 API',
      version: '0.1.0',
    },
  });
}
