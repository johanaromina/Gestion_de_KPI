export const storeAuthToken = (token: string, rememberMe: boolean) => {
  localStorage.removeItem('token')
  sessionStorage.removeItem('token')
  const storage = rememberMe ? localStorage : sessionStorage
  storage.setItem('token', token)
}

export const persistSsoRememberMe = (rememberMe: boolean) => {
  sessionStorage.setItem('ssoRememberMe', rememberMe ? '1' : '0')
}

export const consumeSsoRememberMe = () => {
  const rememberValue = sessionStorage.getItem('ssoRememberMe')
  sessionStorage.removeItem('ssoRememberMe')
  return rememberValue !== '0'
}
