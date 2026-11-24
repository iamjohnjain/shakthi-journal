import { useNavigate } from 'react-router-dom'
import { Compass } from 'lucide-react'
import './NotFound.css'

export default function NotFound() {
  const navigate = useNavigate()
  return (
    <div className="notfound-page">
      <Compass size={40} className="notfound-icon" />
      <h1>Page Not Found</h1>
      <p>This page doesn't exist or may have moved.</p>
      <button className="notfound-btn" onClick={() => navigate('/')}>Go To Dashboard</button>
    </div>
  )
}
