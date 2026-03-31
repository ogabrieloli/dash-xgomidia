'use client'

import { useState, useRef, useEffect } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

interface Message {
  role: 'user' | 'assistant'
  content: string
  tokens?: { input: number; output: number }
}

interface AiChatProps {
  strategyId: string
  clientId: string
}

export function AiChat({ strategyId, clientId }: AiChatProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const chatMutation = useMutation({
    mutationFn: async (question: string) => {
      const res = await api.post<{
        data: {
          answer: string
          usage: { inputTokens: number; outputTokens: number }
        }
      }>('/api/ai/chat', { strategyId, clientId, question })
      return res.data.data
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer,
          tokens: { input: data.usage.inputTokens, output: data.usage.outputTokens },
        },
      ])
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || chatMutation.isPending) return

    const question = input.trim()
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: question }])
    chatMutation.mutate(question)
  }

  return (
    <div className="mt-8 rounded-lg border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b">
        <Sparkles className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">Chat de IA</h2>
        <span className="ml-auto text-xs text-muted-foreground">
          Faça perguntas sobre esta campanha
        </span>
      </div>

      {/* Messages */}
      <div className="h-80 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
            <Bot className="h-10 w-10 text-muted-foreground/30" />
            <div>
              <p className="text-sm font-medium text-muted-foreground">Assistente de Tráfego</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Pergunte sobre métricas, otimizações ou análises desta campanha
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center mt-2">
              {[
                'Como está o ROAS desta semana?',
                'Quais são os próximos passos?',
                'O CTR está bom?',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion)
                  }}
                  className="rounded-full border border-input bg-background px-3 py-1 text-xs hover:bg-accent transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div
              key={idx}
              className={cn('flex gap-3', msg.role === 'user' && 'flex-row-reverse')}
            >
              <div className={cn(
                'flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted',
              )}>
                {msg.role === 'user'
                  ? <User className="h-3.5 w-3.5" />
                  : <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                }
              </div>

              <div className={cn(
                'max-w-[75%] rounded-lg px-3 py-2 text-sm',
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground',
              )}>
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                {msg.tokens && (
                  <p className={cn(
                    'text-xs mt-1',
                    msg.role === 'user' ? 'text-primary-foreground/60' : 'text-muted-foreground/60',
                  )}>
                    {msg.tokens.input + msg.tokens.output} tokens
                  </p>
                )}
              </div>
            </div>
          ))
        )}

        {chatMutation.isPending && (
          <div className="flex gap-3">
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-muted">
              <Loader2 className="h-3.5 w-3.5 text-muted-foreground animate-spin" />
            </div>
            <div className="rounded-lg bg-muted px-3 py-2">
              <div className="flex gap-1">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce"
                    style={{ animationDelay: `${i * 150}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-2 px-4 py-3 border-t">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pergunte algo sobre esta campanha..."
          disabled={chatMutation.isPending}
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || chatMutation.isPending}
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {chatMutation.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>
    </div>
  )
}
