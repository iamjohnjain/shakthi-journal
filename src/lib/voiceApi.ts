import { supabase } from './supabase'

/** Sends a recorded voice clip to the transcribe-audio Edge Function and
    returns the transcript — empty string on any failure, never throws, same
    soft-failure contract as every other AI call in this app
    (coachChatApi.ts, aiMealParser.ts, aiWorkoutParser.ts). */
export async function transcribeAudio(audioDataUrl: string): Promise<string> {
  if (!supabase) return ''
  try {
    const { data, error } = await supabase.functions.invoke<{ text: string }>('transcribe-audio', {
      body: { audio: audioDataUrl },
    })
    if (error || !data) return ''
    return data.text ?? ''
  } catch {
    return ''
  }
}
