export const GET_USER_PROFILE_METHOD = 'keycloak_integration.api.get_user_profile' as const
export const SET_USER_AVATAR_METHOD = 'keycloak_integration.api.set_user_avatar' as const

export type UserProfilePayload = {
  message: {
    user_code: string
    full_name: string
    email: string
    designation: string
    company: string
    status: string
    avatar_choice: string
    avatar_set: boolean
    available_avatars: string[]
  }
}

export type SetAvatarPayload = {
  message: {
    status: string
    user_code: string
    avatar_choice: string
  }
}

export function resolveAvatarSrc(choice: string | null | undefined): string {
  if (!choice) return '/UserIcon.svg'
  return `/avatars/${choice}.svg`
}
