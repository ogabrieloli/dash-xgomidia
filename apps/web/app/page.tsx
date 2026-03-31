import { redirect } from 'next/navigation'

// Redirecionar para o login por padrão
export default function Home() {
  redirect('/login')
}
