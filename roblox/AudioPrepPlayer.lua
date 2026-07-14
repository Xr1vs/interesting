--[[
	AUDIO PREP PLAYER
	------------------------------------------------------------------
	Modern jukebox UI for playing back audio that was processed with the
	Audio Prep Console (pitch shifted down by PLAYBACK_SPEED, split into
	on-disk chunks). This script plays the chunks back-to-back and sets
	Sound.PlaybackSpeed so the pitch/tempo sounds correct in-game.

	SETUP
	------------------------------------------------------------------
	1. Upload your processed chunk files to Roblox (Creator Dashboard ->
	   Creations -> Audio, or Studio's Asset Manager). Each upload gives
	   you an asset id like rbxassetid://123456789.
	2. Fill in the TRACKS table below with your own asset ids, in order.
	3. Put this LocalScript in StarterPlayer > StarterPlayerScripts.
	   (Or require() it from a ModuleScript setup of your own.)

	Everything here is just playing audio you own/uploaded — no network
	calls, no external services.
]]

local Players            = game:GetService("Players")
local TweenService        = game:GetService("TweenService")
local RunService          = game:GetService("RunService")

local player = Players.LocalPlayer

-- ============================================================
-- CONFIG — fill this in with your own uploaded asset ids
-- ============================================================

local PLAYBACK_SPEED = 2.941 -- must match whatever the console used

local TRACKS = {
	{
		name = "Track One",
		artist = "Your Name",
		-- list every chunk in playback order, e.g. _part1, _part2, ...
		chunks = {
			"rbxassetid://0000000001",
			"rbxassetid://0000000002",
		},
	},
	{
		name = "Track Two (Concert Set)",
		artist = "Your Name — Live",
		chunks = {
			"rbxassetid://0000000003",
			"rbxassetid://0000000004",
			"rbxassetid://0000000005",
		},
	},
}

-- ============================================================
-- THEME
-- ============================================================

local THEME = {
	bg        = Color3.fromRGB(19, 17, 13),
	panel     = Color3.fromRGB(28, 25, 19),
	panelHi   = Color3.fromRGB(35, 32, 22),
	hairline  = Color3.fromRGB(58, 51, 36),
	text      = Color3.fromRGB(236, 228, 208),
	textDim   = Color3.fromRGB(143, 135, 112),
	amber     = Color3.fromRGB(255, 176, 32),
	green     = Color3.fromRGB(92, 228, 136),
}

local function corner(inst, r)
	local c = Instance.new("UICorner")
	c.CornerRadius = UDim.new(0, r or 8)
	c.Parent = inst
	return c
end

local function stroke(inst, color, thickness)
	local s = Instance.new("UIStroke")
	s.Color = color or THEME.hairline
	s.Thickness = thickness or 1
	s.Parent = inst
	return s
end

-- ============================================================
-- UI BUILD
-- ============================================================

local gui = Instance.new("ScreenGui")
gui.Name = "AudioPrepPlayer"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = true
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = player:WaitForChild("PlayerGui")

-- Floating launcher button
local launcher = Instance.new("TextButton")
launcher.Name = "Launcher"
launcher.Size = UDim2.fromOffset(52, 52)
launcher.Position = UDim2.new(1, -70, 1, -70)
launcher.AnchorPoint = Vector2.new(0, 0)
launcher.BackgroundColor3 = THEME.panel
launcher.Text = "▶"
launcher.Font = Enum.Font.GothamBold
launcher.TextSize = 20
launcher.TextColor3 = THEME.amber
launcher.Parent = gui
corner(launcher, 26)
stroke(launcher, THEME.amber, 1)

-- Main window
local window = Instance.new("Frame")
window.Name = "Window"
window.Size = UDim2.fromOffset(360, 460)
window.Position = UDim2.new(1, -380, 1, -480)
window.BackgroundColor3 = THEME.bg
window.Visible = false
window.Parent = gui
corner(window, 12)
stroke(window, THEME.hairline, 1)

local shadow = Instance.new("UIStroke")
shadow.Color = Color3.new(0, 0, 0)
shadow.Thickness = 0
shadow.Parent = window

-- Header
local header = Instance.new("Frame")
header.Size = UDim2.new(1, 0, 0, 46)
header.BackgroundColor3 = THEME.panel
header.Parent = window
corner(header, 12)

local title = Instance.new("TextLabel")
title.BackgroundTransparency = 1
title.Position = UDim2.fromOffset(16, 0)
title.Size = UDim2.new(1, -60, 1, 0)
title.Font = Enum.Font.GothamBold
title.Text = "AUDIO PLAYER"
title.TextSize = 14
title.TextColor3 = THEME.text
title.TextXAlignment = Enum.TextXAlignment.Left
title.Parent = header

local closeBtn = Instance.new("TextButton")
closeBtn.BackgroundTransparency = 1
closeBtn.Size = UDim2.fromOffset(36, 36)
closeBtn.Position = UDim2.new(1, -42, 0, 5)
closeBtn.Text = "✕"
closeBtn.Font = Enum.Font.GothamBold
closeBtn.TextSize = 16
closeBtn.TextColor3 = THEME.textDim
closeBtn.Parent = header

-- Now playing card
local npCard = Instance.new("Frame")
npCard.Size = UDim2.new(1, -24, 0, 100)
npCard.Position = UDim2.fromOffset(12, 58)
npCard.BackgroundColor3 = THEME.panel
npCard.Parent = window
corner(npCard, 10)
stroke(npCard)

local npTrack = Instance.new("TextLabel")
npTrack.BackgroundTransparency = 1
npTrack.Position = UDim2.fromOffset(14, 10)
npTrack.Size = UDim2.new(1, -28, 0, 22)
npTrack.Font = Enum.Font.GothamBold
npTrack.Text = "Nothing playing"
npTrack.TextSize = 15
npTrack.TextColor3 = THEME.text
npTrack.TextXAlignment = Enum.TextXAlignment.Left
npTrack.TextTruncate = Enum.TextTruncate.AtEnd
npTrack.Parent = npCard

local npArtist = Instance.new("TextLabel")
npArtist.BackgroundTransparency = 1
npArtist.Position = UDim2.fromOffset(14, 32)
npArtist.Size = UDim2.new(1, -28, 0, 16)
npArtist.Font = Enum.Font.Gotham
npArtist.Text = ""
npArtist.TextSize = 12
npArtist.TextColor3 = THEME.textDim
npArtist.TextXAlignment = Enum.TextXAlignment.Left
npArtist.Parent = npCard

-- Progress bar
local barBack = Instance.new("Frame")
barBack.Position = UDim2.fromOffset(14, 58)
barBack.Size = UDim2.new(1, -28, 0, 6)
barBack.BackgroundColor3 = THEME.hairline
barBack.Parent = npCard
corner(barBack, 3)

local barFill = Instance.new("Frame")
barFill.Size = UDim2.new(0, 0, 1, 0)
barFill.BackgroundColor3 = THEME.amber
barFill.Parent = barBack
corner(barFill, 3)

local timeLabel = Instance.new("TextLabel")
timeLabel.BackgroundTransparency = 1
timeLabel.Position = UDim2.fromOffset(14, 68)
timeLabel.Size = UDim2.new(1, -28, 0, 16)
timeLabel.Font = Enum.Font.Code
timeLabel.Text = "00:00 / 00:00"
timeLabel.TextSize = 11
timeLabel.TextColor3 = THEME.textDim
timeLabel.TextXAlignment = Enum.TextXAlignment.Left
timeLabel.Parent = npCard

-- Transport controls
local transport = Instance.new("Frame")
transport.Size = UDim2.new(1, -24, 0, 44)
transport.Position = UDim2.fromOffset(12, 166)
transport.BackgroundTransparency = 1
transport.Parent = window

local function makeTransportBtn(text, xOffset, w)
	local b = Instance.new("TextButton")
	b.Size = UDim2.fromOffset(w or 44, 44)
	b.Position = UDim2.fromOffset(xOffset, 0)
	b.BackgroundColor3 = THEME.panel
	b.Font = Enum.Font.GothamBold
	b.Text = text
	b.TextSize = 16
	b.TextColor3 = THEME.text
	b.Parent = transport
	corner(b, 10)
	stroke(b)
	return b
end

local prevBtn = makeTransportBtn("⏮", 40)
local playBtn = makeTransportBtn("▶", 40 + 52)
local nextBtn = makeTransportBtn("⏭", 40 + 52 + 52)

-- Volume slider
local volRow = Instance.new("Frame")
volRow.Size = UDim2.new(1, -24, 0, 24)
volRow.Position = UDim2.fromOffset(12, 220)
volRow.BackgroundTransparency = 1
volRow.Parent = window

local volLabel = Instance.new("TextLabel")
volLabel.BackgroundTransparency = 1
volLabel.Size = UDim2.fromOffset(50, 24)
volLabel.Font = Enum.Font.Code
volLabel.Text = "VOL"
volLabel.TextSize = 11
volLabel.TextColor3 = THEME.textDim
volLabel.TextXAlignment = Enum.TextXAlignment.Left
volLabel.Parent = volRow

local volTrack = Instance.new("Frame")
volTrack.Position = UDim2.fromOffset(50, 10)
volTrack.Size = UDim2.new(1, -50, 0, 4)
volTrack.BackgroundColor3 = THEME.hairline
volTrack.Parent = volRow
corner(volTrack, 2)

local volFill = Instance.new("Frame")
volFill.Size = UDim2.new(0.6, 0, 1, 0)
volFill.BackgroundColor3 = THEME.amber
volFill.Parent = volTrack
corner(volFill, 2)

local volKnob = Instance.new("TextButton")
volKnob.Size = UDim2.fromOffset(14, 14)
volKnob.AnchorPoint = Vector2.new(0.5, 0.5)
volKnob.Position = UDim2.new(0.6, 0, 0.5, 0)
volKnob.BackgroundColor3 = THEME.amber
volKnob.Text = ""
volKnob.Parent = volTrack
corner(volKnob, 7)

-- Playlist
local listLabel = Instance.new("TextLabel")
listLabel.BackgroundTransparency = 1
listLabel.Position = UDim2.fromOffset(12, 252)
listLabel.Size = UDim2.new(1, -24, 0, 18)
listLabel.Font = Enum.Font.GothamBold
listLabel.Text = "PLAYLIST"
listLabel.TextSize = 11
listLabel.TextColor3 = THEME.textDim
listLabel.TextXAlignment = Enum.TextXAlignment.Left
listLabel.Parent = window

local scroll = Instance.new("ScrollingFrame")
scroll.Position = UDim2.fromOffset(12, 274)
scroll.Size = UDim2.new(1, -24, 1, -286)
scroll.BackgroundTransparency = 1
scroll.BorderSizePixel = 0
scroll.ScrollBarThickness = 4
scroll.ScrollBarImageColor3 = THEME.hairline
scroll.CanvasSize = UDim2.new(0, 0, 0, 0)
scroll.AutomaticCanvasSize = Enum.AutomaticSize.Y
scroll.Parent = window

local listLayout = Instance.new("UIListLayout")
listLayout.Padding = UDim.new(0, 6)
listLayout.Parent = scroll

-- ============================================================
-- PLAYBACK ENGINE
-- ============================================================

local soundHolder = Instance.new("Folder")
soundHolder.Name = "Sounds"
soundHolder.Parent = gui

local currentTrackIndex = 1
local currentChunkIndex = 1
local currentSound = nil
local isPlaying = false
local userVolume = 0.6
local trackButtons = {}

local function fmt(t)
	t = math.max(0, t or 0)
	local m = math.floor(t / 60)
	local s = math.floor(t % 60)
	return string.format("%02d:%02d", m, s)
end

local function stopCurrent()
	if currentSound then
		currentSound:Stop()
		currentSound:Destroy()
		currentSound = nil
	end
end

local function highlightTrack(i)
	for idx, btn in pairs(trackButtons) do
		if idx == i then
			btn.BackgroundColor3 = THEME.panelHi
			btn.UIStroke.Color = THEME.amber
		else
			btn.BackgroundColor3 = THEME.panel
			btn.UIStroke.Color = THEME.hairline
		end
	end
end

local function playChunk(trackIndex, chunkIndex)
	local track = TRACKS[trackIndex]
	if not track then return end
	local assetId = track.chunks[chunkIndex]
	if not assetId then
		-- ran off the end of this track -> advance to next track
		currentTrackIndex = trackIndex + 1
		if currentTrackIndex > #TRACKS then currentTrackIndex = 1 end
		playChunk(currentTrackIndex, 1)
		return
	end

	stopCurrent()

	local s = Instance.new("Sound")
	s.SoundId = assetId
	s.Volume = userVolume
	s.PlaybackSpeed = PLAYBACK_SPEED -- restores original pitch/tempo
	s.Parent = soundHolder
	currentSound = s

	npTrack.Text = track.name
	npArtist.Text = (track.artist or "") .. string.format("  ·  chunk %d/%d", chunkIndex, #track.chunks)
	highlightTrack(trackIndex)

	s:Play()
	isPlaying = true
	playBtn.Text = "⏸"

	s.Ended:Connect(function()
		if isPlaying and currentSound == s then
			currentChunkIndex = chunkIndex + 1
			playChunk(trackIndex, currentChunkIndex)
		end
	end)
end

local function play(trackIndex)
	currentTrackIndex = trackIndex or currentTrackIndex
	currentChunkIndex = 1
	playChunk(currentTrackIndex, currentChunkIndex)
end

local function togglePause()
	if not currentSound then
		play(currentTrackIndex)
		return
	end
	if currentSound.Playing then
		currentSound:Pause()
		isPlaying = false
		playBtn.Text = "▶"
	else
		currentSound:Resume()
		isPlaying = true
		playBtn.Text = "⏸"
	end
end

local function nextTrack()
	currentTrackIndex = currentTrackIndex + 1
	if currentTrackIndex > #TRACKS then currentTrackIndex = 1 end
	play(currentTrackIndex)
end

local function prevTrack()
	currentTrackIndex = currentTrackIndex - 1
	if currentTrackIndex < 1 then currentTrackIndex = #TRACKS end
	play(currentTrackIndex)
end

-- Build playlist entries
for i, track in ipairs(TRACKS) do
	local item = Instance.new("TextButton")
	item.Size = UDim2.new(1, 0, 0, 40)
	item.BackgroundColor3 = THEME.panel
	item.AutoButtonColor = false
	item.Text = ""
	item.LayoutOrder = i
	item.Parent = scroll
	corner(item, 8)
	stroke(item)
	trackButtons[i] = item

	local nameLbl = Instance.new("TextLabel")
	nameLbl.BackgroundTransparency = 1
	nameLbl.Position = UDim2.fromOffset(12, 4)
	nameLbl.Size = UDim2.new(1, -24, 0, 18)
	nameLbl.Font = Enum.Font.GothamBold
	nameLbl.Text = track.name
	nameLbl.TextSize = 13
	nameLbl.TextColor3 = THEME.text
	nameLbl.TextXAlignment = Enum.TextXAlignment.Left
	nameLbl.Parent = item

	local subLbl = Instance.new("TextLabel")
	subLbl.BackgroundTransparency = 1
	subLbl.Position = UDim2.fromOffset(12, 20)
	subLbl.Size = UDim2.new(1, -24, 0, 16)
	subLbl.Font = Enum.Font.Gotham
	subLbl.Text = string.format("%s  ·  %d chunk(s)", track.artist or "", #track.chunks)
	subLbl.TextSize = 11
	subLbl.TextColor3 = THEME.textDim
	subLbl.TextXAlignment = Enum.TextXAlignment.Left
	subLbl.Parent = item

	item.MouseButton1Click:Connect(function()
		play(i)
	end)
end

-- Progress bar tick
RunService.Heartbeat:Connect(function()
	if currentSound and currentSound.TimeLength > 0 then
		-- convert on-disk time to Roblox playback time
		local playedTime = currentSound.TimePosition * PLAYBACK_SPEED
		local totalTime = currentSound.TimeLength * PLAYBACK_SPEED
		barFill.Size = UDim2.new(math.clamp(playedTime / totalTime, 0, 1), 0, 1, 0)
		timeLabel.Text = fmt(playedTime) .. " / " .. fmt(totalTime)
	end
end)

-- Button wiring
playBtn.MouseButton1Click:Connect(togglePause)
nextBtn.MouseButton1Click:Connect(nextTrack)
prevBtn.MouseButton1Click:Connect(prevTrack)

closeBtn.MouseButton1Click:Connect(function()
	window.Visible = false
end)

launcher.MouseButton1Click:Connect(function()
	window.Visible = not window.Visible
end)

-- Volume drag
local draggingVol = false
volKnob.InputBegan:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
		draggingVol = true
	end
end)
RunService.RenderStepped:Connect(function()
	if draggingVol then
		local mouse = player:GetMouse()
		local rel = math.clamp((mouse.X - volTrack.AbsolutePosition.X) / volTrack.AbsoluteSize.X, 0, 1)
		userVolume = rel
		volFill.Size = UDim2.new(rel, 0, 1, 0)
		volKnob.Position = UDim2.new(rel, 0, 0.5, 0)
		if currentSound then currentSound.Volume = userVolume end
	end
end)
Players.LocalPlayer.PlayerGui.DescendantRemoving:Connect(function() end)
game:GetService("UserInputService").InputEnded:Connect(function(input)
	if input.UserInputType == Enum.UserInputType.MouseButton1 or input.UserInputType == Enum.UserInputType.Touch then
		draggingVol = false
	end
end)

if #TRACKS > 0 then
	highlightTrack(1)
end
