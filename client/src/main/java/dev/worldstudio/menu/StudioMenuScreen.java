package dev.worldstudio.menu;

import java.io.IOException;
import java.util.List;
import net.minecraft.client.gui.GuiGraphicsExtractor;
import net.minecraft.client.gui.components.Button;
import net.minecraft.client.gui.components.EditBox;
import net.minecraft.client.gui.screens.ChatScreen;
import net.minecraft.client.gui.screens.Screen;
import net.minecraft.core.BlockPos;
import net.minecraft.network.chat.Component;

final class StudioMenuScreen extends Screen {
    private enum Page { HOME, NAME, MARKERS, ACTIONS, SECOND }
    private final BlockPos target;
    private Page page = Page.HOME;
    private List<StudioMenuClient.Marker> markers = List.of();
    private StudioMenuClient.Marker first;
    private String heading, subtitle, markerError, draft = "";
    private int left, top, span, offset;

    StudioMenuScreen(BlockPos target) {
        super(Component.literal("World Studio"));
        this.target = target;
    }

    @Override public boolean isPauseScreen() { return false; }

    private void show(Page next) {
        page = next;
        rebuildWidgets();
    }

    private Button button(String label, int row, int col, int columns, Runnable action) {
        int cell = (span + 4) / columns;
        return addRenderableWidget(Button.builder(Component.literal(label), b -> action.run())
            .bounds(left + col * cell, top + row * 22, columns == 1 ? span : cell - 4, 20).build());
    }

    @Override protected void init() {
        span = Math.min(280, width - 16);
        left = (width - span) / 2;
        top = Math.max(32, height / 2 - 54);
        heading = "World Studio";
        subtitle = target == null ? "No block under the crosshair" : "Target  " + target.toShortString();
        switch (page) {
            case HOME -> {
                button("Mark this block", 0, 0, 2, () -> show(Page.NAME)).active = target != null;
                button("Saved markers", 0, 1, 2, () -> openPicker(Page.MARKERS));
                button("Inspect target", 1, 0, 2, () -> send("where"));
                button("Clear selection", 1, 1, 2, () -> send("select clear"));
                button("Ask Studio…", 2, 0, 2, () -> minecraft.gui.setScreen(new ChatScreen("@studio ", false)));
                button("Inspect view", 2, 1, 2, () -> send("look"));
                button("Studio status", 3, 0, 2, () -> send("status"));
                button("Cancel request", 3, 1, 2, () -> send("cancel"));
                button("Done", 4, 0, 1, this::onClose);
            }
            case NAME -> {
                heading = "Mark this block";
                var name = addRenderableWidget(new EditBox(font, left, top, span, 20, Component.literal("Marker name")));
                name.setMaxLength(40);
                name.setHint(Component.literal("Marker name"));
                name.setValue(draft);
                var save = button("Save marker", 1, 0, 1, () -> pointCommand("mark", draft.strip()));
                save.active = !draft.isBlank();
                name.setResponder(value -> { draft = value; save.active = !value.isBlank(); });
                setInitialFocus(name);
                button("Back", 2, 0, 1, () -> show(Page.HOME));
            }
            case MARKERS, SECOND -> drawPicker();
            case ACTIONS -> {
                heading = first.name();
                subtitle = first.x() + "  " + first.y() + "  " + first.z();
                button("Locate", 0, 0, 2, () -> send("locate " + first.name()));
                button("Use this point", 0, 1, 2, () -> send("select " + first.name()));
                button("Move here", 1, 0, 2, () -> pointCommand("move", first.name())).active = target != null;
                button("Select region to…", 1, 1, 2, () -> openPicker(Page.SECOND)).active = markers.size() > 1;
                button("Back", 2, 0, 1, () -> openPicker(Page.MARKERS));
            }
        }
    }

    private void openPicker(Page next) {
        offset = 0;
        markerError = null;
        try {
            markers = StudioMenuClient.readMarkers(minecraft);
        } catch (IOException | RuntimeException e) {
            markers = List.of();
            markerError = "Open the lab with World Studio.cmd, then try again.";
        }
        show(next);
    }

    private void drawPicker() {
        boolean second = page == Page.SECOND;
        var choices = second ? markers.stream().filter(m -> !m.name().equals(first.name())).toList() : markers;
        heading = second ? "Choose the opposite corner" : "Saved markers";
        subtitle = second ? "First corner  " + first.name() : "Choose a point";
        if (choices.isEmpty()) subtitle = markerError != null ? markerError : "No saved points. Aim at a block and mark it.";
        int perPage = 4;
        for (int i = offset; i < Math.min(offset + perPage, choices.size()); i++) {
            var marker = choices.get(i);
            button(marker.name(), i - offset, 0, 1, () -> {
                if (second) send("select " + first.name() + " to " + marker.name());
                else { first = marker; show(Page.ACTIONS); }
            });
        }
        button("Previous", 4, 0, 3, () -> { offset -= perPage; rebuildWidgets(); }).active = offset > 0;
        button("Back", 4, 1, 3, () -> show(second ? Page.ACTIONS : Page.HOME));
        button("Next", 4, 2, 3, () -> { offset += perPage; rebuildWidgets(); }).active = offset + perPage < choices.size();
    }

    private void pointCommand(String verb, String name) {
        send("menu " + verb + " " + target.getX() + " " + target.getY() + " " + target.getZ() + " " + name);
    }

    private void send(String request) {
        onClose();
        if (StudioMenuClient.inLab(minecraft) && minecraft.getConnection() != null)
            minecraft.getConnection().sendChat("@studio " + request);
    }

    @Override public void extractRenderState(GuiGraphicsExtractor graphics, int mouseX, int mouseY, float delta) {
        super.extractRenderState(graphics, mouseX, mouseY, delta);
        graphics.centeredText(font, heading, width / 2, top - 27, 0xffffffff);
        graphics.centeredText(font, subtitle, width / 2, top - 15, 0xffdddddd);
    }
}
