import type { FormEvent } from 'react'
import { Server, XCircle, Eye, EyeOff, Loader2 as SpinnerIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

export interface AuthFormProps {
  /**
   * `gate` renders plain headings for the full-screen auth gate (avoids Radix
   * focus-trap overhead during Electron window drag). `dialog` renders Radix
   * Dialog header primitives for the re-login dialog.
   */
  variant: 'gate' | 'dialog'
  gatewayStep: 'url' | 'auth'
  setGatewayStep: (step: 'url' | 'auth') => void
  apiUrl: string
  isStandaloneApp: boolean
  serverHasUsers: boolean | null

  // Gateway URL step
  gatewayUrlInput: string
  setGatewayUrlInput: (value: string) => void
  gatewayError: string | null
  setGatewayError: (value: string | null) => void
  gatewayChecking: boolean
  checkGatewayHealth: (event: FormEvent) => void

  // Auth step
  authTab: 'login' | 'register'
  setAuthTab: (tab: 'login' | 'register') => void
  authSubmitting: boolean
  authError: string | null
  handleLogin: (event: FormEvent) => void
  handleRegister: (event: FormEvent) => void

  loginUsername: string
  setLoginUsername: (value: string) => void
  loginPassword: string
  setLoginPassword: (value: string) => void
  showLoginPassword: boolean
  setShowLoginPassword: (value: boolean) => void

  registerUsername: string
  setRegisterUsername: (value: string) => void
  registerPassword: string
  setRegisterPassword: (value: string) => void
  registerPasswordConfirm: string
  setRegisterPasswordConfirm: (value: string) => void
  showRegisterPassword: boolean
  setShowRegisterPassword: (value: boolean) => void
  showRegisterConfirmPassword: boolean
  setShowRegisterConfirmPassword: (value: boolean) => void
}

export function AuthForm(props: AuthFormProps) {
  const {
    variant,
    gatewayStep,
    setGatewayStep,
    apiUrl,
    isStandaloneApp,
    serverHasUsers,
    gatewayUrlInput,
    setGatewayUrlInput,
    gatewayError,
    setGatewayError,
    gatewayChecking,
    checkGatewayHealth,
    authTab,
    setAuthTab,
    authSubmitting,
    authError,
    handleLogin,
    handleRegister,
    loginUsername,
    setLoginUsername,
    loginPassword,
    setLoginPassword,
    showLoginPassword,
    setShowLoginPassword,
    registerUsername,
    setRegisterUsername,
    registerPassword,
    setRegisterPassword,
    registerPasswordConfirm,
    setRegisterPasswordConfirm,
    showRegisterPassword,
    setShowRegisterPassword,
    showRegisterConfirmPassword,
    setShowRegisterConfirmPassword,
  } = props

  if (gatewayStep === 'url') {
    return (
      <>
        {variant === 'dialog' ? (
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Server className="h-5 w-5" />
              Connect to Gateway
            </DialogTitle>
            <DialogDescription>
              Enter your Jait gateway URL to get started.
            </DialogDescription>
          </DialogHeader>
        ) : (
          <div className="flex flex-col space-y-1.5 text-center sm:text-left">
            <h2 className="text-lg font-semibold leading-none tracking-tight flex items-center gap-2">
              <Server className="h-5 w-5" />
              Connect to Gateway
            </h2>
            <p className="text-sm text-muted-foreground">
              Enter your Jait gateway URL to get started.
            </p>
          </div>
        )}
        <form onSubmit={checkGatewayHealth} className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <Label htmlFor="gateway-url">Gateway URL</Label>
            <Input
              id="gateway-url"
              placeholder="https://jait.example.com"
              value={gatewayUrlInput}
              onChange={(e) => { setGatewayUrlInput(e.target.value); setGatewayError(null) }}
              autoFocus
            />
          </div>
          {gatewayError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <XCircle className="h-4 w-4 shrink-0" />
              {gatewayError}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={gatewayChecking}>
            {gatewayChecking ? (
              <>
                <SpinnerIcon className="h-4 w-4 mr-2 animate-spin" />
                Connecting…
              </>
            ) : (
              'Connect'
            )}
          </Button>
        </form>
      </>
    )
  }

  const title = serverHasUsers === false ? 'Welcome to Jait' : 'Account'
  const description = isStandaloneApp ? (
    <div className="flex items-center gap-1.5 flex-wrap">
      <Server className="h-3 w-3 text-green-500" />
      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{apiUrl}</code>
      <button
        type="button"
        className="text-xs text-primary underline underline-offset-2 hover:opacity-80"
        onClick={() => setGatewayStep('url')}
      >
        Change
      </button>
    </div>
  ) : serverHasUsers === false ? (
    <p>Create your account to get started.</p>
  ) : (
    <p>Sign in with a username and password.</p>
  )

  return (
    <>
      {variant === 'dialog' ? (
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            {description}
          </DialogDescription>
        </DialogHeader>
      ) : (
        <div className="flex flex-col space-y-1.5 text-center sm:text-left">
          <h2 className="text-lg font-semibold leading-none tracking-tight">
            {title}
          </h2>
          <div className="text-sm text-muted-foreground">
            {description}
          </div>
        </div>
      )}
      <Tabs value={authTab} onValueChange={(value) => setAuthTab(value as 'login' | 'register')}>
        <TabsList className="grid grid-cols-2 w-full">
          <TabsTrigger value="login">Login</TabsTrigger>
          <TabsTrigger value="register">Register</TabsTrigger>
        </TabsList>
        <TabsContent value="login" className="pt-4">
          <form className="space-y-4" onSubmit={handleLogin}>
            <div className="space-y-1.5">
              <Label htmlFor="login-username">Username</Label>
              <Input
                id="login-username"
                value={loginUsername}
                onChange={(event) => setLoginUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="login-password">Password</Label>
              <div className="group/pw relative">
                <Input
                  id="login-password"
                  type={showLoginPassword ? 'text' : 'password'}
                  value={loginPassword}
                  onChange={(event) => setLoginPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent opacity-0 group-focus-within/pw:opacity-100 transition-opacity"
                  onClick={() => setShowLoginPassword(!showLoginPassword)}
                  tabIndex={-1}
                >
                  {showLoginPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={authSubmitting}>
              {authSubmitting ? 'Signing in…' : 'Login'}
            </Button>
          </form>
        </TabsContent>
        <TabsContent value="register" className="pt-4">
          <form className="space-y-4" onSubmit={handleRegister}>
            <div className="space-y-1.5">
              <Label htmlFor="register-username">Username</Label>
              <Input
                id="register-username"
                value={registerUsername}
                onChange={(event) => setRegisterUsername(event.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="register-password">Password</Label>
              <div className="group/pw relative">
                <Input
                  id="register-password"
                  type={showRegisterPassword ? 'text' : 'password'}
                  value={registerPassword}
                  onChange={(event) => setRegisterPassword(event.target.value)}
                  autoComplete="new-password"
                  required
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent opacity-0 group-focus-within/pw:opacity-100 transition-opacity"
                  onClick={() => setShowRegisterPassword(!showRegisterPassword)}
                  tabIndex={-1}
                >
                  {showRegisterPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="register-password-confirm">Confirm password</Label>
              <div className="group/pw relative">
                <Input
                  id="register-password-confirm"
                  type={showRegisterConfirmPassword ? 'text' : 'password'}
                  value={registerPasswordConfirm}
                  onChange={(event) => setRegisterPasswordConfirm(event.target.value)}
                  autoComplete="new-password"
                  required
                  className="pr-10"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full px-3 hover:bg-transparent opacity-0 group-focus-within/pw:opacity-100 transition-opacity"
                  onClick={() => setShowRegisterConfirmPassword(!showRegisterConfirmPassword)}
                  tabIndex={-1}
                >
                  {showRegisterConfirmPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={authSubmitting}>
              {authSubmitting ? 'Creating account…' : serverHasUsers === false ? 'Get Started' : 'Create account'}
            </Button>
          </form>
        </TabsContent>
      </Tabs>
      {authError && <p className="text-sm text-destructive">{authError}</p>}
    </>
  )
}
