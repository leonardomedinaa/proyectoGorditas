import '../styles/boton.css'

export default function Boton({ type = "button", children, disabled, onClick, className = "" }) {
  return (
    <button 
      type={type} 
      /* 🔗 Aquí es donde fusionamos tu clase fija con cualquier otra que le mandes */
      className={`btn-staff ${className}`} 
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}