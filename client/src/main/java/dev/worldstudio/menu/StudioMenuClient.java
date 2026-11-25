package dev.worldstudio.menu;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.mojang.blaze3d.platform.InputConstants;
import java.io.IOException;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.List;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.keymapping.v1.KeyMappingHelper;
import net.minecraft.client.KeyMapping;
import net.minecraft.client.Minecraft;
import net.minecraft.network.chat.Component;
import net.minecraft.resources.Identifier;
import net.minecraft.world.level.Level;
import net.minecraft.world.level.storage.LevelResource;
import net.minecraft.world.phys.BlockHitResult;
import net.minecraft.world.phys.HitResult;

public final class StudioMenuClient implements ClientModInitializer {
    @Override
    public void onInitializeClient() {
        var category = KeyMapping.Category.register(Identifier.fromNamespaceAndPath("worldstudio_menu", "studio"));
        var key = KeyMappingHelper.registerKeyMapping(new KeyMapping("key.worldstudio_menu.open", InputConstants.KEY_J, category));
        ClientTickEvents.END_CLIENT_TICK.register(client -> {
            while (key.consumeClick()) {
                if (client.gui.screen() != null || client.player == null) continue;
                if (!inLab(client)) {
                    client.player.sendSystemMessage(Component.literal("Open WorldStudioLab in singleplayer Creative to use World Studio."));
                    continue;
                }
                var hit = client.player.pick(96.0, 1.0f, false);
                var block = hit.getType() == HitResult.Type.BLOCK ? ((BlockHitResult) hit).getBlockPos() : null;
                client.gui.setScreen(new StudioMenuScreen(block));
            }
        });
    }

    static boolean inLab(Minecraft client) {
        var server = client.getSingleplayerServer();
        return server != null && !server.isPublished()
            && server.getWorldPath(LevelResource.ROOT).toAbsolutePath().normalize().getFileName().toString().equals("WorldStudioLab")
            && client.level != null && client.level.dimension().equals(Level.OVERWORLD)
            && client.player != null && client.player.isCreative() && client.getUser().getName().equals("WorldStudio");
    }

    record Marker(String name, int x, int y, int z) {}

    static List<Marker> readMarkers(Minecraft client) throws IOException {
        var file = client.gameDirectory.toPath().toAbsolutePath().normalize().resolveSibling("chat-loop").resolve("session.json");
        try (var reader = Files.newBufferedReader(file)) {
            JsonObject session = JsonParser.parseReader(reader).getAsJsonObject();
            if (session.get("version").getAsInt() != 1
                    || !session.get("world").getAsString().equals("sp:WorldStudioLab")
                    || !session.get("dimension").getAsString().equals("minecraft:overworld")
                    || !session.get("player").getAsString().equals(client.getUser().getName())) {
                throw new IOException("Session belongs to a different lab.");
            }
            var markers = new ArrayList<Marker>();
            for (var element : session.getAsJsonArray("markers")) {
                var point = element.getAsJsonObject();
                markers.add(new Marker(point.get("name").getAsString(), point.get("x").getAsInt(),
                    point.get("y").getAsInt(), point.get("z").getAsInt()));
            }
            return markers;
        }
    }
}
