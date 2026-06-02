export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold">Z</div>
          <span className="font-bold text-white text-xl">ZeroAuth</span>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8">
          {children}
        </div>
      </div>
    </div>
  );
}
