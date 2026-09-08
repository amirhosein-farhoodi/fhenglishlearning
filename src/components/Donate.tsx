import { useEffect, useState } from 'react'
import { Check, Copy, Heart, Wallet } from './Icons'

/**
 * A small, honest support card.
 * - USDT on Ethereum (ERC-20) can be sent straight from MetaMask.
 * - USDT on TRON (TRC-20) needs a TRON wallet (TronLink); MetaMask cannot send TRON.
 * In both cases the address can simply be copied and paid from any wallet.
 */

const AMOUNTS = [1, 2, 3, 5, 10]

interface Network {
  id: 'eth' | 'tron'
  label: string
  short: string
  chain: string
  address: string
  /** USDT token contract on that chain. */
  token: string
  decimals: number
  wallet: string
  explorer: string
}

const NETWORKS: Network[] = [
  {
    id: 'eth',
    label: 'USDT on Ethereum',
    short: 'ERC-20',
    chain: 'Ethereum mainnet',
    address: '0x1c06cb9E403a4Dd4f06c4E0Ec56873467510218B',
    token: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    decimals: 6,
    wallet: 'MetaMask',
    explorer: 'https://etherscan.io/tx/',
  },
  {
    id: 'tron',
    label: 'USDT on TRON',
    short: 'TRC-20',
    chain: 'TRON mainnet',
    address: 'TSQMMzHxFq8mo9v6AMjaoDf7YiAFwdGedR',
    token: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
    decimals: 6,
    wallet: 'TronLink',
    explorer: 'https://tronscan.org/#/transaction/',
  },
]

interface Eip1193 {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  isMetaMask?: boolean
}

interface TronWeb {
  defaultAddress?: { base58?: string | false }
  contract: () => { at: (addr: string) => Promise<{ transfer: (to: string, amount: string) => { send: () => Promise<string> } }> }
}

declare global {
  interface Window {
    ethereum?: Eip1193
    tronWeb?: TronWeb
    tronLink?: { request: (args: { method: string }) => Promise<unknown> }
  }
}

/** ERC-20 transfer(address,uint256) call data. */
function erc20TransferData(to: string, units: bigint): string {
  const addr = to.toLowerCase().replace(/^0x/, '').padStart(64, '0')
  const amount = units.toString(16).padStart(64, '0')
  return `0xa9059cbb${addr}${amount}`
}

const toUnits = (usd: number, decimals: number) => BigInt(Math.round(usd * 10 ** decimals))

type Status =
  | { kind: 'idle' }
  | { kind: 'working'; message: string }
  | { kind: 'sent'; hash: string }
  | { kind: 'error'; message: string }

export default function Donate() {
  const [net, setNet] = useState<Network>(NETWORKS[0])
  const [amount, setAmount] = useState(3)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [copied, setCopied] = useState(false)

  useEffect(() => setStatus({ kind: 'idle' }), [net, amount])

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(t)
  }, [copied])

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(net.address)
      setCopied(true)
    } catch {
      // Clipboard blocked (insecure context or permissions): fall back to a selection prompt.
      window.prompt('Copy the address:', net.address)
    }
  }

  const payWithWallet = async () => {
    try {
      if (net.id === 'eth') {
        const eth = window.ethereum
        if (!eth) {
          setStatus({ kind: 'error', message: 'MetaMask was not found in this browser. You can copy the address instead.' })
          return
        }
        setStatus({ kind: 'working', message: 'Waiting for MetaMask…' })
        const accounts = (await eth.request({ method: 'eth_requestAccounts' })) as string[]
        const from = accounts?.[0]
        if (!from) throw new Error('No account was shared.')

        const chainId = (await eth.request({ method: 'eth_chainId' })) as string
        if (chainId !== '0x1') {
          setStatus({ kind: 'working', message: 'Switching MetaMask to Ethereum mainnet…' })
          await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x1' }] })
        }

        setStatus({ kind: 'working', message: `Confirm ${amount} USDT in MetaMask…` })
        const hash = (await eth.request({
          method: 'eth_sendTransaction',
          params: [{ from, to: net.token, data: erc20TransferData(net.address, toUnits(amount, net.decimals)), value: '0x0' }],
        })) as string
        setStatus({ kind: 'sent', hash })
        return
      }

      // TRON
      const tron = window.tronWeb
      if (!tron || !window.tronLink) {
        setStatus({
          kind: 'error',
          message: 'MetaMask cannot send TRON. Install TronLink, or copy the address and pay from any TRC-20 wallet.',
        })
        return
      }
      setStatus({ kind: 'working', message: 'Waiting for TronLink…' })
      await window.tronLink.request({ method: 'tron_requestAccounts' })
      if (!tron.defaultAddress?.base58) throw new Error('TronLink is locked.')
      setStatus({ kind: 'working', message: `Confirm ${amount} USDT in TronLink…` })
      const contract = await tron.contract().at(net.token)
      const hash = await contract.transfer(net.address, toUnits(amount, net.decimals).toString()).send()
      setStatus({ kind: 'sent', hash })
    } catch (e) {
      const err = e as { code?: number | string; message?: string }
      if (err?.code === 4001 || /reject|denied/i.test(err?.message ?? '')) {
        setStatus({ kind: 'idle' })
        return
      }
      setStatus({ kind: 'error', message: err?.message ?? 'The transaction could not be started.' })
    }
  }

  const busy = status.kind === 'working'

  return (
    <section className="donate" aria-labelledby="donate-title">
      <div className="donate-intro">
        <span className="donate-mark" aria-hidden="true">
          <Heart size={16} />
        </span>
        <div>
          <h2 id="donate-title">Enjoying the app?</h2>
          <p>
            It is free, has no ads and no accounts. If it helped you, a small tip keeps it going. Entirely optional -
            nothing is locked behind it.
          </p>
        </div>
      </div>

      <div className="donate-controls">
        <div className="donate-field">
          <span className="donate-label">Amount</span>
          <div className="amount-row" role="radiogroup" aria-label="Donation amount in US dollars">
            {AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={amount === a}
                className={`amount-chip ${amount === a ? 'on' : ''}`}
                onClick={() => setAmount(a)}
                disabled={busy}
              >
                ${a}
              </button>
            ))}
          </div>
        </div>

        <div className="donate-field">
          <span className="donate-label">Network</span>
          <div className="segmented" role="radiogroup" aria-label="Network">
            {NETWORKS.map((nw) => (
              <button
                key={nw.id}
                type="button"
                role="radio"
                aria-checked={net.id === nw.id}
                className={`segment ${net.id === nw.id ? 'on' : ''}`}
                onClick={() => setNet(nw)}
                disabled={busy}
              >
                {nw.label} <small>{nw.short}</small>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="donate-address">
        <code title={net.address}>{net.address}</code>
        <button type="button" className="btn btn-secondary btn-sm" onClick={copyAddress}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div className="donate-actions">
        <button type="button" className="btn btn-dark" onClick={payWithWallet} disabled={busy}>
          <Wallet size={18} />
          {busy ? 'Waiting for wallet…' : `Send $${amount} with ${net.wallet}`}
        </button>
        <span className="donate-note">
          {net.id === 'eth'
            ? 'Opens MetaMask on Ethereum mainnet. You pay the network fee and confirm the amount yourself.'
            : 'TRON needs a TRC-20 wallet such as TronLink. MetaMask does not support TRON - copying the address works with any wallet.'}
        </span>
      </div>

      {status.kind === 'sent' && (
        <p className="donate-status ok">
          Thank you! Your transaction was submitted.{' '}
          <a className="link" href={net.explorer + status.hash} target="_blank" rel="noreferrer noopener">
            View it on the explorer
          </a>
          .
        </p>
      )}
      {status.kind === 'error' && <p className="donate-status bad">{status.message}</p>}
      {status.kind === 'working' && <p className="donate-status">{status.message}</p>}
    </section>
  )
}
