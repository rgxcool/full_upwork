import { describe, it, expect } from 'vitest'
import {
  detailRouteMeta,
  educationRouteMeta,
  SEARCH_DETAIL_ROLES,
  EDUCATION_DETAILS_ROLES,
} from '@/router/routeRoles.js'
import { userCanAccess } from '@/store/store.js'

const ROUTES = [
  {
    path: '/detaljer/:type/:id',
    meta: detailRouteMeta,
    expectedRoles: SEARCH_DETAIL_ROLES,
  },
  {
    path: '/education/:id',
    meta: educationRouteMeta,
    expectedRoles: EDUCATION_DETAILS_ROLES,
  },
]

const userWithRole = (role) => ({ _id: 'u1', name: 'Test User', role, roles: [role] })

describe('detail route role guard', () => {
  it.each(ROUTES)('denies coordinator access to $path', ({ meta, expectedRoles }) => {
    expect(meta.role).toEqual(expectedRoles)
    expect(userCanAccess(userWithRole('coordinator'), meta)).toBe(false)
  })

  it.each(ROUTES)('allows teacher access to $path', ({ meta, expectedRoles }) => {
    expect(meta.role).toEqual(expectedRoles)
    expect(userCanAccess(userWithRole('teacher'), meta)).toBe(true)
  })
})
