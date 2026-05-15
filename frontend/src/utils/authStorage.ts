export const persistSsoRememberMe = (rememberMe: boolean) => {
  sessionStorage.setItem('ssoRememberMe', rememberMe ? '1' : '0')
}

export const consumeSsoRememberMe = () => {
  const rememberValue = sessionStorage.getItem('ssoRememberMe')
  sessionStorage.removeItem('ssoRememberMe')
  return rememberValue !== '0'
}
