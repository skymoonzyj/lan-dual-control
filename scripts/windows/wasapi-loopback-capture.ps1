param(
  [int]$SampleRate = 48000,
  [int]$Channels = 2,
  [int]$FrameMs = 20,
  [int]$DurationMs = 0,
  [switch]$InfoOnly,
  [Alias("h")]
  [switch]$Help
)

$ErrorActionPreference = "Stop"

if ($Help) {
  Write-Output @"
Usage:
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\wasapi-loopback-capture.ps1 [options]
  powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts\windows\wasapi-loopback-capture.ps1 [options]

Common examples:
  # Print the default render device mix format as JSON without capturing audio.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\wasapi-loopback-capture.ps1 -InfoOnly

  # Capture 2 seconds of system loopback audio as raw float32 PCM on stdout.
  pwsh -NoProfile -ExecutionPolicy Bypass -File scripts\windows\wasapi-loopback-capture.ps1 -DurationMs 2000 > audio-f32le.raw

Options:
  -SampleRate <hz>   Requested sample rate metadata. Default: 48000.
  -Channels <count>  Output channel count, clamped to 1-8. Default: 2.
  -FrameMs <ms>      Target frame size, clamped to 10-60 ms. Default: 20.
  -DurationMs <ms>   Capture duration. Default: 0, capture until stopped.
  -InfoOnly          Print device/audio format JSON and exit without capturing.
  -Help, -h          Show this help without initializing WASAPI or capturing audio.

Safety:
  -Help never initializes WASAPI, never captures or writes audio frames, never
  starts remote hosts, never authenticates, never prints passwords, and never
  sends input/inject events. Without -InfoOnly or -DurationMs, this script runs
  until stopped and writes binary audio to stdout.
"@
  exit 0
}

$source = @'
using System;
using System.Runtime.InteropServices;
using System.Threading;

namespace LanDualControl
{
    public static class WasapiLoopbackCapture
    {
        private const int AUDCLNT_STREAMFLAGS_LOOPBACK = 0x00020000;
        private const int CLSCTX_ALL = 23;
        private const ushort WAVE_FORMAT_PCM = 0x0001;
        private const ushort WAVE_FORMAT_IEEE_FLOAT = 0x0003;
        private const ushort WAVE_FORMAT_EXTENSIBLE = 0xfffe;
        private const uint AUDCLNT_BUFFERFLAGS_SILENT = 0x00000002;

        private static readonly Guid IAudioClientId = new Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2");
        private static readonly Guid IAudioCaptureClientId = new Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317");
        private static readonly Guid KsdAudioSubTypePcm = new Guid("00000001-0000-0010-8000-00aa00389b71");
        private static readonly Guid KsdAudioSubTypeIeeeFloat = new Guid("00000003-0000-0010-8000-00aa00389b71");

        [DllImport("ole32.dll")]
        private static extern void CoTaskMemFree(IntPtr pv);

        [ComImport]
        [Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
        private class MMDeviceEnumeratorComObject
        {
        }

        private enum EDataFlow
        {
            eRender = 0,
            eCapture = 1,
            eAll = 2
        }

        private enum ERole
        {
            eConsole = 0,
            eMultimedia = 1,
            eCommunications = 2
        }

        private enum AudioClientShareMode
        {
            Shared = 0,
            Exclusive = 1
        }

        [ComImport]
        [Guid("A95664D2-9614-4F35-A746-DE8DB63617E6")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMMDeviceEnumerator
        {
            [PreserveSig]
            int EnumAudioEndpoints(EDataFlow dataFlow, uint stateMask, out IntPtr devices);

            [PreserveSig]
            int GetDefaultAudioEndpoint(EDataFlow dataFlow, ERole role, out IMMDevice endpoint);

            [PreserveSig]
            int GetDevice([MarshalAs(UnmanagedType.LPWStr)] string id, out IMMDevice device);

            [PreserveSig]
            int RegisterEndpointNotificationCallback(IntPtr client);

            [PreserveSig]
            int UnregisterEndpointNotificationCallback(IntPtr client);
        }

        [ComImport]
        [Guid("D666063F-1587-4E43-81F1-B948E807363F")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IMMDevice
        {
            [PreserveSig]
            int Activate(ref Guid iid, uint clsCtx, IntPtr activationParams, [MarshalAs(UnmanagedType.IUnknown)] out object interfacePointer);

            [PreserveSig]
            int OpenPropertyStore(uint access, out IntPtr properties);

            [PreserveSig]
            int GetId([MarshalAs(UnmanagedType.LPWStr)] out string id);

            [PreserveSig]
            int GetState(out uint state);
        }

        [ComImport]
        [Guid("1CB9AD4C-DBFA-4c32-B178-C2F568A703B2")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IAudioClient
        {
            [PreserveSig]
            int Initialize(AudioClientShareMode shareMode, int streamFlags, long bufferDuration, long periodicity, IntPtr format, ref Guid audioSessionGuid);

            [PreserveSig]
            int GetBufferSize(out uint bufferFrames);

            [PreserveSig]
            int GetStreamLatency(out long latency);

            [PreserveSig]
            int GetCurrentPadding(out uint paddingFrames);

            [PreserveSig]
            int IsFormatSupported(AudioClientShareMode shareMode, IntPtr format, out IntPtr closestMatch);

            [PreserveSig]
            int GetMixFormat(out IntPtr deviceFormat);

            [PreserveSig]
            int GetDevicePeriod(out long defaultDevicePeriod, out long minimumDevicePeriod);

            [PreserveSig]
            int Start();

            [PreserveSig]
            int Stop();

            [PreserveSig]
            int Reset();

            [PreserveSig]
            int SetEventHandle(IntPtr eventHandle);

            [PreserveSig]
            int GetService(ref Guid serviceId, [MarshalAs(UnmanagedType.IUnknown)] out object service);
        }

        [ComImport]
        [Guid("C8ADBD64-E71E-48a0-A4DE-185C395CD317")]
        [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IAudioCaptureClient
        {
            [PreserveSig]
            int GetBuffer(out IntPtr data, out uint frames, out uint flags, out ulong devicePosition, out ulong qpcPosition);

            [PreserveSig]
            int ReleaseBuffer(uint frames);

            [PreserveSig]
            int GetNextPacketSize(out uint frames);
        }

        [StructLayout(LayoutKind.Sequential, Pack = 2)]
        private struct WaveFormatEx
        {
            public ushort FormatTag;
            public ushort Channels;
            public uint SamplesPerSec;
            public uint AvgBytesPerSec;
            public ushort BlockAlign;
            public ushort BitsPerSample;
            public ushort Size;
        }

        private sealed class WaveInfo
        {
            public ushort FormatTag;
            public ushort Channels;
            public uint SampleRate;
            public ushort BlockAlign;
            public ushort BitsPerSample;
            public bool IsFloat;
            public bool IsPcm;
            public Guid SubFormat;

            public int BytesPerSample
            {
                get { return Math.Max(1, BitsPerSample / 8); }
            }

            public string FormatName
            {
                get
                {
                    if (IsFloat) return "float32";
                    if (IsPcm) return "pcm" + BitsPerSample;
                    return "unknown";
                }
            }
        }

        public static void Run(int requestedSampleRate, int requestedChannels, int frameMs, int durationMs, bool infoOnly)
        {
            IMMDeviceEnumerator enumerator = null;
            IMMDevice endpoint = null;
            IAudioClient audioClient = null;
            IAudioCaptureClient captureClient = null;
            IntPtr mixFormatPointer = IntPtr.Zero;
            bool started = false;

            try
            {
                enumerator = (IMMDeviceEnumerator)(new MMDeviceEnumeratorComObject());
                Check(enumerator.GetDefaultAudioEndpoint(EDataFlow.eRender, ERole.eConsole, out endpoint), "GetDefaultAudioEndpoint");

                object audioClientObject;
                Guid audioClientId = IAudioClientId;
                Check(endpoint.Activate(ref audioClientId, CLSCTX_ALL, IntPtr.Zero, out audioClientObject), "Activate IAudioClient");
                audioClient = (IAudioClient)audioClientObject;

                Check(audioClient.GetMixFormat(out mixFormatPointer), "GetMixFormat");
                WaveInfo info = ReadWaveInfo(mixFormatPointer);
                if (!info.IsFloat && !info.IsPcm)
                {
                    throw new InvalidOperationException("Unsupported WASAPI mix format: tag=" + info.FormatTag + " bits=" + info.BitsPerSample);
                }

                int targetChannels = Clamp(requestedChannels, 1, 8, 2);
                int targetFrameMs = Clamp(frameMs, 10, 60, 20);
                string json = MakeInfoJson(info, requestedSampleRate, targetChannels, targetFrameMs);

                if (infoOnly)
                {
                    Console.Out.WriteLine(json);
                    return;
                }

                Console.Error.WriteLine("LAN_DUAL_WASAPI_INFO " + json);

                long bufferDuration = Math.Max(1000000L, targetFrameMs * 10000L * 4L);
                Guid sessionGuid = Guid.Empty;
                Check(audioClient.Initialize(
                    AudioClientShareMode.Shared,
                    AUDCLNT_STREAMFLAGS_LOOPBACK,
                    bufferDuration,
                    0,
                    mixFormatPointer,
                    ref sessionGuid), "Initialize loopback");

                object captureObject;
                Guid captureClientId = IAudioCaptureClientId;
                Check(audioClient.GetService(ref captureClientId, out captureObject), "GetService IAudioCaptureClient");
                captureClient = (IAudioCaptureClient)captureObject;

                Check(audioClient.Start(), "Start loopback");
                started = true;

                CaptureLoop(captureClient, info, targetChannels, targetFrameMs, durationMs);
            }
            finally
            {
                if (started && audioClient != null)
                {
                    audioClient.Stop();
                }

                if (mixFormatPointer != IntPtr.Zero)
                {
                    CoTaskMemFree(mixFormatPointer);
                }

                ReleaseCom(captureClient);
                ReleaseCom(audioClient);
                ReleaseCom(endpoint);
                ReleaseCom(enumerator);
            }
        }

        private static void CaptureLoop(IAudioCaptureClient captureClient, WaveInfo info, int targetChannels, int frameMs, int durationMs)
        {
            DateTime startedAt = DateTime.UtcNow;
            int sleepMs = Math.Max(2, Math.Min(10, frameMs / 2));
            var output = Console.OpenStandardOutput();

            while (durationMs <= 0 || (DateTime.UtcNow - startedAt).TotalMilliseconds < durationMs)
            {
                uint packetFrames;
                Check(captureClient.GetNextPacketSize(out packetFrames), "GetNextPacketSize");
                if (packetFrames == 0)
                {
                    Thread.Sleep(sleepMs);
                    continue;
                }

                while (packetFrames > 0)
                {
                    IntPtr data;
                    uint frames;
                    uint flags;
                    ulong devicePosition;
                    ulong qpcPosition;
                    Check(captureClient.GetBuffer(out data, out frames, out flags, out devicePosition, out qpcPosition), "GetBuffer");
                    try
                    {
                        if (frames > 0)
                        {
                            byte[] chunk = ConvertToFloat32Interleaved(data, frames, flags, info, targetChannels);
                            output.Write(chunk, 0, chunk.Length);
                            output.Flush();
                        }
                    }
                    finally
                    {
                        Check(captureClient.ReleaseBuffer(frames), "ReleaseBuffer");
                    }

                    Check(captureClient.GetNextPacketSize(out packetFrames), "GetNextPacketSize");
                }
            }
        }

        private static WaveInfo ReadWaveInfo(IntPtr formatPointer)
        {
            WaveFormatEx format = (WaveFormatEx)Marshal.PtrToStructure(formatPointer, typeof(WaveFormatEx));
            Guid subFormat = Guid.Empty;
            if (format.FormatTag == WAVE_FORMAT_EXTENSIBLE && format.Size >= 22)
            {
                subFormat = (Guid)Marshal.PtrToStructure(IntPtr.Add(formatPointer, 24), typeof(Guid));
            }

            bool isFloat = format.FormatTag == WAVE_FORMAT_IEEE_FLOAT
                || (format.FormatTag == WAVE_FORMAT_EXTENSIBLE && subFormat == KsdAudioSubTypeIeeeFloat);
            bool isPcm = format.FormatTag == WAVE_FORMAT_PCM
                || (format.FormatTag == WAVE_FORMAT_EXTENSIBLE && subFormat == KsdAudioSubTypePcm);

            return new WaveInfo
            {
                FormatTag = format.FormatTag,
                Channels = format.Channels,
                SampleRate = format.SamplesPerSec,
                BlockAlign = format.BlockAlign,
                BitsPerSample = format.BitsPerSample,
                IsFloat = isFloat,
                IsPcm = isPcm,
                SubFormat = subFormat
            };
        }

        private static byte[] ConvertToFloat32Interleaved(IntPtr data, uint frames, uint flags, WaveInfo info, int targetChannels)
        {
            int frameCount = checked((int)frames);
            byte[] output = new byte[checked(frameCount * targetChannels * 4)];
            if ((flags & AUDCLNT_BUFFERFLAGS_SILENT) != 0 || data == IntPtr.Zero)
            {
                return output;
            }

            byte[] source = new byte[checked(frameCount * info.BlockAlign)];
            Marshal.Copy(data, source, 0, source.Length);

            for (int frame = 0; frame < frameCount; frame++)
            {
                int sourceFrameOffset = frame * info.BlockAlign;
                for (int channel = 0; channel < targetChannels; channel++)
                {
                    float sample = ReadMappedSample(source, sourceFrameOffset, info, channel, targetChannels);
                    byte[] bytes = BitConverter.GetBytes(sample);
                    Buffer.BlockCopy(bytes, 0, output, (frame * targetChannels + channel) * 4, 4);
                }
            }

            return output;
        }

        private static float ReadMappedSample(byte[] source, int frameOffset, WaveInfo info, int channel, int targetChannels)
        {
            if (targetChannels == 1 && info.Channels > 1)
            {
                double sum = 0;
                for (int sourceChannel = 0; sourceChannel < info.Channels; sourceChannel++)
                {
                    sum += ReadSample(source, frameOffset, info, sourceChannel);
                }
                return (float)(sum / info.Channels);
            }

            int mappedChannel;
            if (info.Channels == 1)
            {
                mappedChannel = 0;
            }
            else if (channel < info.Channels)
            {
                mappedChannel = channel;
            }
            else
            {
                mappedChannel = info.Channels - 1;
            }
            return ReadSample(source, frameOffset, info, mappedChannel);
        }

        private static float ReadSample(byte[] source, int frameOffset, WaveInfo info, int channel)
        {
            int offset = frameOffset + channel * info.BytesPerSample;
            if (info.IsFloat && info.BitsPerSample == 32)
            {
                return ClampFloat(BitConverter.ToSingle(source, offset));
            }

            if (info.IsPcm && info.BitsPerSample == 16)
            {
                return Math.Max(-1f, Math.Min(1f, BitConverter.ToInt16(source, offset) / 32768f));
            }

            if (info.IsPcm && info.BitsPerSample == 24)
            {
                int value = source[offset] | (source[offset + 1] << 8) | (source[offset + 2] << 16);
                if ((value & 0x800000) != 0)
                {
                    value |= unchecked((int)0xff000000);
                }
                return Math.Max(-1f, Math.Min(1f, value / 8388608f));
            }

            if (info.IsPcm && info.BitsPerSample == 32)
            {
                return Math.Max(-1f, Math.Min(1f, BitConverter.ToInt32(source, offset) / 2147483648f));
            }

            throw new InvalidOperationException("Unsupported PCM sample size: " + info.BitsPerSample);
        }

        private static float ClampFloat(float value)
        {
            if (float.IsNaN(value) || float.IsInfinity(value))
            {
                return 0f;
            }
            if (value > 1f) return 1f;
            if (value < -1f) return -1f;
            return value;
        }

        private static string MakeInfoJson(WaveInfo info, int requestedSampleRate, int targetChannels, int frameMs)
        {
            return "{"
                + "\"ok\":true,"
                + "\"backend\":\"wasapi-loopback\","
                + "\"inputSampleRate\":" + info.SampleRate + ","
                + "\"inputChannels\":" + info.Channels + ","
                + "\"inputBitsPerSample\":" + info.BitsPerSample + ","
                + "\"inputBlockAlign\":" + info.BlockAlign + ","
                + "\"inputFormat\":\"" + info.FormatName + "\","
                + "\"requestedSampleRate\":" + requestedSampleRate + ","
                + "\"outputSampleRate\":" + info.SampleRate + ","
                + "\"outputChannels\":" + targetChannels + ","
                + "\"outputEncoding\":\"pcm-f32le-base64\","
                + "\"frameMs\":" + frameMs
                + "}";
        }

        private static int Clamp(int value, int min, int max, int fallback)
        {
            if (value < min || value > max)
            {
                value = fallback;
            }
            return Math.Max(min, Math.Min(max, value));
        }

        private static void Check(int hr, string action)
        {
            if (hr < 0)
            {
                Marshal.ThrowExceptionForHR(hr);
            }
        }

        private static void ReleaseCom(object value)
        {
            if (value != null && Marshal.IsComObject(value))
            {
                Marshal.ReleaseComObject(value);
            }
        }
    }
}
'@

try {
  Add-Type -TypeDefinition $source -Language CSharp
  [LanDualControl.WasapiLoopbackCapture]::Run($SampleRate, $Channels, $FrameMs, $DurationMs, [bool]$InfoOnly)
} catch {
  [Console]::Error.WriteLine("LAN_DUAL_WASAPI_ERROR " + $_.Exception.Message)
  exit 1
}
